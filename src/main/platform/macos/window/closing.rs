// Closing a page's window so that its closing animation shows. AppKit
// animates a closed window off the screen for a moment after `close`
// returns, from what is in it. The window behind a closing key window comes
// in front of it before the animation plays, and so does an app brought
// forward as the window closes, as a Mini Wren's opener is. So the window
// goes above every normal window as it closes. Its page would also leave it
// as soon as the window is dropped, and the animation would show an empty
// frame. So the page stays until the window has gone.

use std::cell::RefCell;
use std::rc::Rc;

use block2::RcBlock;
use objc2::rc::Retained;
use objc2_app_kit::{
    NSFloatingWindowLevel, NSWindow, NSWindowAnimationBehavior,
    NSWindowDidChangeOcclusionStateNotification, NSWindowOcclusionState,
};
use objc2_foundation::{NSDate, NSNotificationCenter, NSTimer};
use wren::WebView;

use super::{Observer, observe};

/// How long a closed window's page is kept at most, in seconds, should
/// AppKit never say the window has gone. Its closing animation takes about
/// a quarter of a second.
const LONGEST_KEPT: f64 = 1.0;

/// Closes `window`, which shows `page`, and lets the page go once the window
/// has left the screen. A window already off the screen, as a second call
/// finds it, closes with no animation, and its page goes at once.
pub(super) fn close(window: &Retained<NSWindow>, page: Option<Rc<WebView>>) {
    if !window.isVisible() || !is_on_screen(window) {
        window.close();
        return;
    }
    // AppKit animates a window above the normal level only when told to.
    window.setAnimationBehavior(NSWindowAnimationBehavior::DocumentWindow);
    window.setLevel(NSFloatingWindowLevel);
    if let Some(page) = page {
        keep_until_gone(window, page);
    }
    window.close();
}

// Keeps `page` until `window` has left the screen, and at most
// `LONGEST_KEPT`. A timer lets the page go. AppKit says the window has gone
// by a change of its occlusion, once the closing animation is over, and the
// timer then fires at once. Chromium posts the same notification from
// inside its own calls, and the timer fires on the run loop, outside them,
// so no web view ends in the middle of one.
fn keep_until_gone(window: &Retained<NSWindow>, page: Rc<WebView>) {
    let kept = Rc::new(Kept {
        page: RefCell::new(Some(page)),
        observer: RefCell::default(),
        timer: RefCell::default(),
    });
    let release = RcBlock::new({
        let kept = kept.clone();
        move |_| kept.release()
    });
    let timer = unsafe {
        NSTimer::scheduledTimerWithTimeInterval_repeats_block(LONGEST_KEPT, false, &release)
    };
    *kept.timer.borrow_mut() = Some(timer);
    let name = unsafe { NSWindowDidChangeOcclusionStateNotification };
    let observer = observe(name, window, {
        let (kept, window) = (kept.clone(), window.clone());
        move || {
            if !is_on_screen(&window) {
                kept.release_soon();
            }
        }
    });
    *kept.observer.borrow_mut() = Some(observer);
}

// A closed window's page, and the timer and the observer that let it go.
// Each holds this, so `release` stops both, and then nothing holds it.
struct Kept {
    page: RefCell<Option<Rc<WebView>>>,
    observer: RefCell<Option<Observer>>,
    timer: RefCell<Option<Retained<NSTimer>>>,
}

impl Kept {
    // Has the timer fire on the run loop's next pass.
    fn release_soon(&self) {
        if let Some(timer) = &*self.timer.borrow() {
            timer.setFireDate(&NSDate::now());
        }
    }

    // Lets the page go, which ends it. Runs once, from the timer.
    fn release(&self) {
        if let Some(observer) = self.observer.take() {
            unsafe { NSNotificationCenter::defaultCenter().removeObserver(observer.as_ref()) };
        }
        if let Some(timer) = self.timer.take() {
            timer.invalidate();
        }
        self.page.take();
    }
}

// Whether any of `window` is on the screen, as the window server says, its
// closing animation included. AppKit counts a window not visible as soon as
// it is closed.
fn is_on_screen(window: &NSWindow) -> bool {
    window
        .occlusionState()
        .contains(NSWindowOcclusionState::Visible)
}
