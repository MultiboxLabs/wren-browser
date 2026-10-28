// What a window's delegate hands on: its close button, to the closure it
// was made with, and a change to or from full screen AppKit could not make,
// which only its delegate hears of.

use std::cell::RefCell;

use objc2::rc::Retained;
use objc2::runtime::{NSObject, NSObjectProtocol};
use objc2::{DefinedClass, MainThreadMarker, MainThreadOnly, define_class, msg_send};
use objc2_app_kit::{NSWindow, NSWindowDelegate};

pub(super) struct Delegated {
    should_close: Box<dyn Fn() -> bool>,
    full_screen_failed: RefCell<Vec<Box<dyn Fn()>>>,
}

define_class!(
    #[unsafe(super(NSObject))]
    #[thread_kind = MainThreadOnly]
    #[name = "WrenWindowDelegate"]
    #[ivars = Delegated]
    pub(super) struct WindowDelegate;

    unsafe impl NSObjectProtocol for WindowDelegate {}

    unsafe impl NSWindowDelegate for WindowDelegate {
        #[unsafe(method(windowShouldClose:))]
        fn window_should_close(&self, _sender: &NSWindow) -> bool {
            (self.ivars().should_close)()
        }

        #[unsafe(method(windowDidFailToEnterFullScreen:))]
        fn window_did_fail_to_enter_full_screen(&self, _window: &NSWindow) {
            self.full_screen_failed();
        }

        #[unsafe(method(windowDidFailToExitFullScreen:))]
        fn window_did_fail_to_exit_full_screen(&self, _window: &NSWindow) {
            self.full_screen_failed();
        }
    }
);

impl WindowDelegate {
    pub(super) fn new(
        mtm: MainThreadMarker,
        should_close: Box<dyn Fn() -> bool>,
    ) -> Retained<Self> {
        let this = Self::alloc(mtm).set_ivars(Delegated {
            should_close,
            full_screen_failed: RefCell::default(),
        });
        unsafe { msg_send![super(this), init] }
    }

    pub(super) fn on_full_screen_failed(&self, run: impl Fn() + 'static) {
        self.ivars()
            .full_screen_failed
            .borrow_mut()
            .push(Box::new(run));
    }

    fn full_screen_failed(&self) {
        for run in self.ivars().full_screen_failed.borrow().iter() {
            run();
        }
    }
}
