// Sparkle's user driver (SPUUserDriver), which draws nothing: it keeps what
// Sparkle asks until the app answers (mod.rs), and follows the download.
// Every method of the protocol is here, as Sparkle calls each; what it
// would show and the app does not is answered at once.

use std::rc::Rc;

use block2::Block;
use objc2::rc::Retained;
use objc2::runtime::AnyObject;
use objc2::{DefinedClass, MainThreadMarker, MainThreadOnly, define_class, msg_send};
use objc2_foundation::{NSError, NSObject, NSObjectProtocol};

use super::{DISMISS, INSTALL, STAGE_INSTALLING, Shared, display_version};
use crate::platform::updater::UpdaterState;

define_class!(
    // SAFETY: NSObject has no subclassing requirements, and Driver does not
    // implement Drop.
    #[unsafe(super(NSObject))]
    #[thread_kind = MainThreadOnly]
    #[ivars = Rc<Shared>]
    pub(super) struct Driver;

    unsafe impl NSObjectProtocol for Driver {}

    // By Sparkle's selectors: a near miss would go uncalled.
    impl Driver {
        // The manifest turns checks on (SUEnableAutomaticChecks), so this is
        // not asked; if it is, checks stay on.
        #[unsafe(method(showUpdatePermissionRequest:reply:))]
        fn permission(&self, _request: &AnyObject, reply: &Block<dyn Fn(*mut AnyObject)>) {
            let Some(class) = objc2::runtime::AnyClass::get(c"SUUpdatePermissionResponse") else {
                return;
            };
            let response: Retained<AnyObject> = unsafe {
                let response: objc2::rc::Allocated<AnyObject> = msg_send![class, alloc];
                msg_send![
                    response,
                    initWithAutomaticUpdateChecks: true,
                    sendSystemProfile: false
                ]
            };
            reply.call((Retained::as_ptr(&response).cast_mut(),));
        }

        #[unsafe(method(showUserInitiatedUpdateCheckWithCancellation:))]
        fn user_initiated_check(&self, _cancellation: &Block<dyn Fn()>) {}

        // An update. Information alone, with nothing to download, is passed
        // over. One already installing, from an earlier run, is ready. With
        // Automatic Updates on, it downloads; off, it waits for `download`.
        #[unsafe(method(showUpdateFoundWithAppcastItem:state:reply:))]
        fn update_found(&self, item: &AnyObject, state: &AnyObject, reply: &Block<dyn Fn(isize)>) {
            let shared = self.ivars();
            let information: bool = unsafe { msg_send![item, isInformationOnlyUpdate] };
            if information {
                return reply.call((DISMISS,));
            }
            let version = display_version(item);
            *shared.version.borrow_mut() = version.clone();
            let stage: isize = unsafe { msg_send![state, stage] };
            if stage == STAGE_INSTALLING {
                *shared.ready.borrow_mut() = Some(reply.copy());
                return shared.set(UpdaterState::Ready { version });
            }
            if shared.options.get().automatic {
                shared.set(UpdaterState::Downloading {
                    version,
                    progress: None,
                });
                return reply.call((INSTALL,));
            }
            *shared.found.borrow_mut() = Some(reply.copy());
            shared.set(UpdaterState::Available { version });
        }

        #[unsafe(method(showUpdateReleaseNotesWithDownloadData:))]
        fn release_notes(&self, _data: &AnyObject) {}

        #[unsafe(method(showUpdateReleaseNotesFailedToDownloadWithError:))]
        fn release_notes_failed(&self, _error: &NSError) {}

        // The delegate hears how the check ended.
        #[unsafe(method(showUpdateNotFoundWithError:acknowledgement:))]
        fn update_not_found(&self, _error: &NSError, acknowledgement: &Block<dyn Fn()>) {
            acknowledgement.call(());
        }

        #[unsafe(method(showUpdaterError:acknowledgement:))]
        fn updater_error(&self, _error: &NSError, acknowledgement: &Block<dyn Fn()>) {
            acknowledgement.call(());
        }

        #[unsafe(method(showDownloadInitiatedWithCancellation:))]
        fn download_initiated(&self, _cancellation: &Block<dyn Fn()>) {
            let shared = self.ivars();
            shared.expected.set(0);
            shared.received.set(0);
            shared.set(UpdaterState::Downloading {
                version: shared.version(),
                progress: None,
            });
        }

        #[unsafe(method(showDownloadDidReceiveExpectedContentLength:))]
        fn download_length(&self, length: u64) {
            let shared = self.ivars();
            shared.expected.set(length);
            shared.received.set(0);
            self.progress();
        }

        #[unsafe(method(showDownloadDidReceiveDataOfLength:))]
        fn download_data(&self, length: u64) {
            let shared = self.ivars();
            shared.received.set(shared.received.get() + length);
            self.progress();
        }

        // Unpacking is the download's end.
        #[unsafe(method(showDownloadDidStartExtractingUpdate))]
        fn extracting(&self) {
            let shared = self.ivars();
            shared.set(UpdaterState::Downloading {
                version: shared.version(),
                progress: Some(1.0),
            });
        }

        #[unsafe(method(showExtractionReceivedProgress:))]
        fn extraction_progress(&self, _progress: f64) {}

        // Kept until the app relaunches. Unanswered, Sparkle installs the
        // update as the app quits.
        #[unsafe(method(showReadyToInstallAndRelaunch:))]
        fn ready_to_install(&self, reply: &Block<dyn Fn(isize)>) {
            let shared = self.ivars();
            *shared.ready.borrow_mut() = Some(reply.copy());
            shared.set(UpdaterState::Ready {
                version: shared.version(),
            });
        }

        // After Install, as the app quits.
        #[unsafe(method(showInstallingUpdateWithApplicationTerminated:retryTerminatingApplication:))]
        fn installing(&self, _terminated: bool, _retry: &Block<dyn Fn()>) {}

        #[unsafe(method(showUpdateInstalledAndRelaunched:acknowledgement:))]
        fn installed(&self, _relaunched: bool, acknowledgement: &Block<dyn Fn()>) {
            acknowledgement.call(());
        }

        #[unsafe(method(showUpdateInFocus))]
        fn update_in_focus(&self) {}

        // The update's session is over: nothing it asked waits any more.
        #[unsafe(method(dismissUpdateInstallation))]
        fn dismiss(&self) {
            let shared = self.ivars();
            shared.found.borrow_mut().take();
            shared.ready.borrow_mut().take();
        }
    }
);

impl Driver {
    pub(super) fn new(mtm: MainThreadMarker, shared: Rc<Shared>) -> Retained<Driver> {
        let driver = Driver::alloc(mtm).set_ivars(shared);
        unsafe { msg_send![super(driver), init] }
    }

    // How far the download is, by the hundredth: not for each piece that
    // comes. None while its size is not known.
    fn progress(&self) {
        let shared = self.ivars();
        let expected = shared.expected.get();
        let progress = (expected > 0).then(|| {
            let done = shared.received.get().min(expected);
            (done * 100 / expected) as f32 / 100.0
        });
        shared.set(UpdaterState::Downloading {
            version: shared.version(),
            progress,
        });
    }
}
