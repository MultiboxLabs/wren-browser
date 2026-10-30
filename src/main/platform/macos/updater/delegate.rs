// Sparkle's updater delegate (SPUUpdaterDelegate): which channels the app
// takes, and how each check ends, while no update waits for an answer.

use std::rc::Rc;

use objc2::rc::Retained;
use objc2::runtime::AnyObject;
use objc2::{DefinedClass, MainThreadMarker, MainThreadOnly, define_class, msg_send};
use objc2_foundation::{NSError, NSObject, NSObjectProtocol, NSSet, NSString, ns_string};

use super::{NO_UPDATE, Shared, message};
use crate::platform::updater::UpdaterState;

define_class!(
    // SAFETY: NSObject has no subclassing requirements, and Delegate does
    // not implement Drop.
    #[unsafe(super(NSObject))]
    #[thread_kind = MainThreadOnly]
    #[ivars = Rc<Shared>]
    pub(super) struct Delegate;

    unsafe impl NSObjectProtocol for Delegate {}

    // By Sparkle's selectors: a near miss would go uncalled.
    impl Delegate {
        #[unsafe(method(updater:mayPerformUpdateCheck:error:))]
        fn may_perform_update_check(
            &self,
            _updater: &AnyObject,
            _check: isize,
            _error: *mut *mut NSError,
        ) -> bool {
            let shared = self.ivars();
            if !shared.waiting() {
                shared.set(UpdaterState::Checking);
            }
            true
        }

        // Beta's releases are on the channel "beta"; the rest are on none,
        // which every updater takes.
        #[unsafe(method_id(allowedChannelsForUpdater:))]
        fn allowed_channels(&self, _updater: &AnyObject) -> Retained<NSSet<NSString>> {
            if self.ivars().options.get().beta {
                NSSet::from_slice(&[ns_string!("beta")])
            } else {
                NSSet::new()
            }
        }

        // Nothing new is up to date; any other error, a failure. An update
        // waiting for an answer keeps its state.
        #[unsafe(method(updater:didFinishUpdateCycleForUpdateCheck:error:))]
        fn did_finish_update_cycle(
            &self,
            _updater: &AnyObject,
            _check: isize,
            error: Option<&NSError>,
        ) {
            let shared = self.ivars();
            if shared.waiting() {
                return;
            }
            shared.set(match error {
                Some(error) if error.code() != NO_UPDATE => UpdaterState::Failed {
                    message: message(error),
                },
                _ => UpdaterState::UpToDate,
            });
        }
    }
);

impl Delegate {
    pub(super) fn new(mtm: MainThreadMarker, shared: Rc<Shared>) -> Retained<Delegate> {
        let delegate = Delegate::alloc(mtm).set_ivars(shared);
        unsafe { msg_send![super(delegate), init] }
    }
}
