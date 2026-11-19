// A page's window going full screen and coming back, and whether the user
// can take it there. AppKit says when it starts and finishes in
// notifications, and when it fails only to the window's delegate.

use std::rc::Rc;

use objc2_app_kit::{
    NSWindow, NSWindowCollectionBehavior, NSWindowDidEnterFullScreenNotification,
    NSWindowDidExitFullScreenNotification, NSWindowStyleMask,
    NSWindowWillEnterFullScreenNotification, NSWindowWillExitFullScreenNotification,
};

use super::{PageWindow, observe};

impl PageWindow {
    pub fn is_full_screen(&self) -> bool {
        self.title_bar.full_screen.get()
    }

    pub fn watch_full_screen(&self, changed: impl Fn(bool) + 'static) {
        let changed = Rc::new(changed);
        let mut observers = self.observers.borrow_mut();
        for (name, full_screen) in unsafe {
            [
                (NSWindowWillEnterFullScreenNotification, true),
                (NSWindowWillExitFullScreenNotification, false),
            ]
        } {
            let changed = changed.clone();
            observers.push(observe(name, &self.window, move || changed(full_screen)));
        }
        let window = self.window.clone();
        self.delegate
            .on_full_screen_failed(move || changed(is_full_screen(&window)));
    }

    pub fn watch_full_screen_finished(&self, changed: impl Fn(bool) + 'static) {
        let changed = Rc::new(changed);
        let mut observers = self.observers.borrow_mut();
        for name in unsafe {
            [
                NSWindowDidEnterFullScreenNotification,
                NSWindowDidExitFullScreenNotification,
            ]
        } {
            let (changed, window) = (changed.clone(), self.window.clone());
            observers.push(observe(name, &self.window, move || {
                changed(is_full_screen(&window))
            }));
        }
        let window = self.window.clone();
        self.delegate
            .on_full_screen_failed(move || changed(is_full_screen(&window)));
    }

    pub fn allow_full_screen(&self, allowed: bool) {
        self.title_bar.kept_out_of_full_screen.set(!allowed);
        if !self.is_full_screen() {
            allow(&self.window, allowed);
        }
    }

    pub fn set_full_screen(&self, full_screen: bool) {
        if self.is_full_screen() != full_screen {
            self.window.toggleFullScreen(None);
        }
    }
}

// Lets `window`, which is not full screen, go there, or keeps it out.
pub(super) fn allow(window: &NSWindow, allowed: bool) {
    window.setCollectionBehavior(if allowed {
        NSWindowCollectionBehavior::FullScreenPrimary
    } else {
        NSWindowCollectionBehavior::FullScreenAuxiliary
    });
}

// Whether AppKit has the window full screen now, which it says only once
// the change has finished.
pub(super) fn is_full_screen(window: &NSWindow) -> bool {
    window.styleMask().contains(NSWindowStyleMask::FullScreen)
}
