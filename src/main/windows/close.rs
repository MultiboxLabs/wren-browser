// Closing: a window's close button, ⌘W, and what a window does as one of
// its Browsers closes. Chromium closes a Browser whose last tab closes, and
// a window goes only once its Browsers have (`browser_closed`).

use std::rc::Rc;

use wren::{Browser, MainThread};

use crate::analytics::TabFrom;
use crate::app::State;
use crate::ipc;
use crate::peeks;
use crate::pins;
use crate::platform::QUITS_WITH_LAST_WINDOW;
use crate::tabs;
use crate::windows::{self, BrowserWindow, WindowId};

/// The close button of window `id`. Where the last window quits the app
/// (not on a Mac), it is kept with its session for the next run. Any
/// other is forgotten, and leaves by closing its Browsers, as Chrome's
/// does, and goes once they have. A page's "Leave site?" may keep them
/// all open, and the window with them, still kept.
pub fn close(state: &Rc<State>, mt: MainThread, id: WindowId) {
    if QUITS_WITH_LAST_WINDOW && state.windows.len() <= 1 {
        return mt.quit();
    }
    let Some(window) = state.windows.get(id) else {
        return;
    };
    ipc::quit_window_closing(state, id);
    // A move its page asks about waits for an answer that can't come now.
    ipc::forget_move_question(id);
    if window.has_browsers() {
        let state = Rc::downgrade(state);
        let closed = window.clone();
        return window.close_browsers(move || {
            if let Some(state) = state.upgrade() {
                windows::forget(&state, &closed);
            }
        });
    }
    windows::forget(state, &window);
    // It has no Browser to close, and is not dropped inside its own
    // delegate's call.
    let state = Rc::downgrade(state);
    mt.later(move |_| {
        if let Some(state) = state.upgrade() {
            state.windows.remove(id);
        }
    });
}

/// ⌘W: the omnibox for a new tab, as if it were that tab; else the space
/// the user makes, which the window comes back from; else the active tab;
/// or, with none of its own, the window, as Chrome's goes with its last
/// tab.
pub fn close_tab(state: &Rc<State>, mt: MainThread, window: &BrowserWindow) {
    if window.has_new_tab_omnibox() {
        return ipc::send_close_omnibox(window);
    }
    if window.left_space().is_some() {
        if let Err(error) = windows::cancel_new_space(state, window.id) {
            eprintln!("Wren could not leave the new space: {error}");
        }
        return;
    }
    let active = window
        .browser_with_tabs()
        .and_then(|browser| Some((browser.active_tab()?, browser)));
    match active {
        // A peek goes back into where it came from, as its Close button
        // takes it.
        Some((tab, _)) if tabs::roles::behind(tab).is_some() => peeks::close_animated(window, tab),
        // A pin's tab closes with the rest of the pin's, if it is a
        // split's, and leaves the pin unopened.
        Some((tab, browser)) => match tabs::roles::pin_of(tab) {
            Some(pin) => {
                let _ = pins::close(state, &browser, pin);
            }
            None => {
                let _ = tabs::closes::close(&browser, tab, TabFrom::Command);
            }
        },
        None => close(state, mt, window.id),
    }
}

/// `browser` closed, which a window showed: Chromium closes a Browser whose
/// last tab closes. Its window stays, with the space empty, unless the user
/// is closing the window: that goes with its last Browser, and the app with
/// the last window where it quits so. A window on a profile stays too: at
/// quit, each Browser closes before the app hears of the quit, and the
/// window must be kept. One whose profile was deleted goes with it
/// (`leave_gone_profiles`). A Mini Wren goes with its Browser,
/// always.
pub fn browser_closed(state: &Rc<State>, mt: MainThread, browser: &Browser) {
    let Some(window) = state.windows.of(browser) else {
        return;
    };
    let place = window.remove(browser);
    if window.is_mini_wren() {
        windows::mini_wren::closed(state, &window);
        ipc::quit_window_closing(state, window.id);
        ipc::forget_move_question(window.id);
        state.windows.remove(window.id);
        return;
    }
    if window.is_closing() {
        if !window.has_browsers() {
            state.windows.remove(window.id);
            if QUITS_WITH_LAST_WINDOW && state.windows.len() == 0 {
                mt.quit();
            }
        }
        return;
    }
    if place.is_some() && place == window.place() {
        ipc::send_no_browser(&window);
        windows::update_title(state, &window);
    } else if let Some(place) = place {
        ipc::send_no_tabs_for(&window, &place);
    }
}
