// macOS's side of platform/updater.rs: Sparkle 2, which the bundle holds in
// Contents/Frameworks (scripts/sparkle.ts, the manifests' `frameworks`) and
// the app loads as it starts: nothing links it, so an app bundled without
// it has no updater.
//
// Sparkle draws only through its user driver, and the app's (driver.rs)
// draws nothing: it keeps each question Sparkle asks until the app answers.
// Both modes take that one path. Sparkle never downloads by itself
// (`automaticallyDownloadsUpdates` stays off); with Automatic Updates on,
// the driver takes an update as soon as it is found. Once it is ready, the
// driver keeps Sparkle's last question: answered as the app relaunches, or
// Sparkle installs the update as the app quits, without launching it.

mod delegate;
mod driver;

use std::cell::{Cell, RefCell};
use std::rc::{Rc, Weak};

use block2::RcBlock;
use objc2::rc::{Allocated, Retained};
use objc2::runtime::{AnyClass, AnyObject, AnyProtocol};
use objc2::{ClassType, MainThreadMarker, msg_send};
use objc2_foundation::{NSBundle, NSError, NSString, NSUserDefaults, ns_string};
use wren::MainThread;

use self::delegate::Delegate;
use self::driver::Driver;
use crate::platform::updater::{UpdaterOptions, UpdaterState};

// SPUUserUpdateChoice.
const INSTALL: isize = 1;
const DISMISS: isize = 2;

// SPUUserUpdateStage: downloaded, and begun installing in the background.
const STAGE_INSTALLING: isize = 2;

// SUError: no update was found.
const NO_UPDATE: isize = 1001;

/// One of Sparkle's questions, answered with a `SPUUserUpdateChoice`.
type Reply = RcBlock<dyn Fn(isize)>;

/// What the driver and the delegate share with `Updater`.
struct Shared {
    mt: MainThread,
    options: Cell<UpdaterOptions>,
    state: RefCell<UpdaterState>,
    /// The version of the update found.
    version: RefCell<String>,
    /// Sparkle's question on the update found, until `download`.
    found: RefCell<Option<Reply>>,
    /// Sparkle's question on the update that is ready: Install installs it
    /// and launches the app again.
    ready: RefCell<Option<Reply>>,
    /// The download's size, if known, and how much has come.
    expected: Cell<u64>,
    received: Cell<u64>,
    changed: Box<dyn Fn(&UpdaterState)>,
    /// A change is to be told.
    telling: Cell<bool>,
}

impl Shared {
    fn set(self: &Rc<Self>, state: UpdaterState) {
        if *self.state.borrow() == state {
            return;
        }
        *self.state.borrow_mut() = state;
        // Told once the call Sparkle is in is over, never inside it, and
        // once for all that changed in between, as a download does with
        // every piece that comes.
        if !self.telling.replace(true) {
            let shared = Rc::downgrade(self);
            self.mt.later(move |_| {
                let Some(shared) = Weak::upgrade(&shared) else {
                    return;
                };
                shared.telling.set(false);
                let state = shared.state.borrow().clone();
                (shared.changed)(&state);
            });
        }
    }

    /// An update is waiting for an answer: no check finds another meanwhile.
    fn waiting(&self) -> bool {
        self.found.borrow().is_some() || self.ready.borrow().is_some()
    }

    fn version(&self) -> String {
        self.version.borrow().clone()
    }
}

/// Answers one of Sparkle's questions.
fn answer(reply: Reply, choice: isize) {
    reply.call((choice,));
}

pub struct Updater {
    updater: Retained<AnyObject>,
    // Kept here: SPUUpdater holds its delegate weakly.
    _driver: Retained<Driver>,
    _delegate: Retained<Delegate>,
    shared: Rc<Shared>,
}

impl Updater {
    pub fn start(
        mt: MainThread,
        options: UpdaterOptions,
        changed: Box<dyn Fn(&UpdaterState)>,
    ) -> Option<Updater> {
        let mtm = MainThreadMarker::new()?;
        let bundle = NSBundle::mainBundle();
        // The manifest's, or a user default's, to test against a feed of
        // one's own (updates.md, "Testing an update on your Mac").
        let feed = bundle
            .objectForInfoDictionaryKey(ns_string!("SUFeedURL"))
            .is_some()
            || NSUserDefaults::standardUserDefaults()
                .stringForKey(ns_string!("SUFeedURL"))
                .is_some();
        if !feed {
            return None;
        }
        let class = load_sparkle(&bundle)?;

        let shared = Rc::new(Shared {
            mt,
            options: Cell::new(options),
            state: RefCell::new(UpdaterState::Idle),
            version: RefCell::default(),
            found: RefCell::default(),
            ready: RefCell::default(),
            expected: Cell::new(0),
            received: Cell::new(0),
            changed,
            telling: Cell::new(false),
        });
        let driver = Driver::new(mtm, shared.clone());
        let delegate = Delegate::new(mtm, shared.clone());
        let updater: Allocated<AnyObject> = unsafe { msg_send![class, alloc] };
        let updater: Retained<AnyObject> = unsafe {
            msg_send![
                updater,
                initWithHostBundle: &*bundle,
                applicationBundle: &*bundle,
                userDriver: &*driver,
                delegate: &*delegate
            ]
        };
        let _: () = unsafe { msg_send![&*updater, setAutomaticallyDownloadsUpdates: false] };
        let started: Result<(), Retained<NSError>> =
            unsafe { msg_send![&*updater, startUpdater: _] };
        if let Err(error) = started {
            eprintln!(
                "Wren's updater did not start: {}",
                error.localizedDescription()
            );
            return None;
        }
        Some(Updater {
            updater,
            _driver: driver,
            _delegate: delegate,
            shared,
        })
    }

    pub fn state(&self) -> UpdaterState {
        self.shared.state.borrow().clone()
    }

    pub fn set_options(&self, options: UpdaterOptions) {
        self.shared.options.set(options);
        // Turned on while an update waits to download: it downloads.
        if options.automatic {
            self.download();
        }
    }

    pub fn check(&self, asked: bool) {
        if self.shared.waiting() {
            return;
        }
        let busy: bool = unsafe { msg_send![&*self.updater, sessionInProgress] };
        if busy {
            return;
        }
        // Asked, it is the user's check, which also offers a version once
        // passed over; the app shows what it finds all the same.
        if asked {
            let _: () = unsafe { msg_send![&*self.updater, checkForUpdates] };
        } else {
            let _: () = unsafe { msg_send![&*self.updater, checkForUpdatesInBackground] };
        }
    }

    pub fn download(&self) {
        let found = self.shared.found.borrow_mut().take();
        if let Some(reply) = found {
            self.shared.set(UpdaterState::Downloading {
                version: self.shared.version(),
                progress: None,
            });
            answer(reply, INSTALL);
        }
    }

    pub fn install_and_relaunch(&self) -> bool {
        let ready = self.shared.ready.borrow_mut().take();
        let Some(reply) = ready else {
            return false;
        };
        answer(reply, INSTALL);
        true
    }
}

// Loads Sparkle.framework from Contents/Frameworks, and gives its updater's
// class, once the app's classes say they are what Sparkle takes them for.
fn load_sparkle(bundle: &NSBundle) -> Option<&'static AnyClass> {
    let frameworks = bundle.privateFrameworksPath()?;
    let path = frameworks.stringByAppendingPathComponent(ns_string!("Sparkle.framework"));
    let sparkle = NSBundle::bundleWithPath(&path)?;
    // SAFETY: Sparkle's code, which the app's signature covers, runs as it
    // loads; it starts nothing until its updater is made.
    if !unsafe { sparkle.load() } {
        eprintln!("Wren could not load {path}.");
        return None;
    }
    conform(Driver::class(), c"SPUUserDriver");
    conform(Delegate::class(), c"SPUUpdaterDelegate");
    AnyClass::get(c"SPUUpdater")
}

// Adds Sparkle's protocol to one of the app's classes, which has its methods.
fn conform(class: &AnyClass, protocol: &std::ffi::CStr) {
    if let Some(protocol) = AnyProtocol::get(protocol) {
        let class = class as *const AnyClass as *mut AnyClass;
        unsafe { objc2::ffi::class_addProtocol(class, protocol) };
    }
}

// What an NSError says, for the app to show.
fn message(error: &NSError) -> String {
    error.localizedDescription().to_string()
}

// The appcast item's version, as people see it.
fn display_version(item: &AnyObject) -> String {
    let version: Retained<NSString> = unsafe { msg_send![item, displayVersionString] };
    version.to_string()
}
