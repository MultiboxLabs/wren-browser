// Locks on tabs' input. Each tab has its own list of locks, and ignores
// input while any is on it. Each lock has an ID of its own (`InputLock`), so
// letting one go never lifts another held for another reason.
//
// A window holds some locks on all its tabs at once, as a dialog does with
// its scrim over the window. Its tabs have the lock while it holds it,
// those that come to the window too, and a tab that moves to another
// window takes that window's instead. Every lock a window holds is its
// page's, so they all go with the page, should it crash or load again
// under a dialog (`page_gone`).
//
// Wren Runtime refuses the keyboard to a tab that ignores input, so a tab
// given it then (`give_keyboard`) waits, and has it as the window lets go of
// its last lock, if it is still the active tab in front. A dialog's answer
// that makes a tab active, such as a move to another space, so leaves the
// keyboard on that tab and not on the page.

use std::cell::RefCell;
use std::collections::{HashMap, HashSet};

use serde::Deserialize;
use wren::{Browser, BrowserTab};

use crate::windows::BrowserWindow;

/// Why a tab ignores input. Each is held and let go on its own.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum InputLock {
    /// One of Wren's dialogs is up, its scrim over the window
    /// (components/ui/dialog.tsx).
    Dialog,
}

impl InputLock {
    // Whether a window holds it on all its tabs, so a tab has it only while
    // in that window.
    fn is_window_wide(self) -> bool {
        match self {
            InputLock::Dialog => true,
        }
    }
}

/// The locks a window holds on all its tabs.
#[derive(Default)]
pub struct WindowInputLocks(RefCell<HashSet<InputLock>>);

thread_local! {
    // By tab, whose ID is the app's own whichever Browser it is in. A tab
    // with no lock on it has no entry.
    static LOCKS: RefCell<HashMap<BrowserTab, HashSet<InputLock>>> = RefCell::default();
    // Tabs given the keyboard while they ignored input.
    static WAITING: RefCell<HashSet<BrowserTab>> = RefCell::default();
}

/// Gives `tab`'s page the keyboard, or, while it ignores input, once its
/// window lets go of its last lock.
pub fn give_keyboard(tab: BrowserTab) {
    if is_locked(tab) {
        WAITING.with(|waiting| waiting.borrow_mut().insert(tab));
    } else {
        let _ = tab.focus();
    }
}

/// Holds `lock` on `window`'s tabs, or lets it go.
pub fn set_on_window(window: &BrowserWindow, lock: InputLock, held: bool) {
    let was_locked = !window.input_locks.0.borrow().is_empty();
    toggle(&mut window.input_locks.0.borrow_mut(), lock, held);
    // Its active tab in front, if it waits for the keyboard.
    let waiting = window
        .browser()
        .and_then(|browser| browser.active_tab())
        .filter(|tab| WAITING.with(|waiting| waiting.borrow().contains(tab)));
    for browser in window.browsers() {
        for tab in browser.tabs() {
            change(tab, |on_tab| toggle(on_tab, lock, held));
        }
    }
    // A tab that ignores input can still take keys from an input method and
    // the Tab key, so the page takes the keyboard from it.
    if held && !was_locked {
        let _ = window.page.web_view.focus();
    }
    if let Some(tab) = waiting.filter(|tab| !is_locked(*tab)) {
        let _ = tab.focus();
    }
}

/// Lets go every lock `window`'s page held, as the page has gone.
pub fn page_gone(window: &BrowserWindow) {
    let held: Vec<InputLock> = window.input_locks.0.borrow().iter().copied().collect();
    for lock in held {
        set_on_window(window, lock, false);
    }
}

/// Gives `browser`'s tabs the locks `window` holds on all its tabs in place
/// of any window's before, as it comes to the window and as tabs come to
/// it. A tab's own locks stay.
pub fn follow(window: &BrowserWindow, browser: &Browser) {
    let of_window = window.input_locks.0.borrow();
    for tab in browser.tabs() {
        change(tab, |on_tab| {
            on_tab.retain(|lock| !lock.is_window_wide());
            on_tab.extend(of_window.iter().copied());
        });
    }
}

/// Forgets the locks of tabs that have closed.
pub fn forget_closed() {
    LOCKS.with(|locks| locks.borrow_mut().retain(|tab, _| tab.browser().is_some()));
    WAITING.with(|waiting| waiting.borrow_mut().retain(|tab| tab.browser().is_some()));
}

fn is_locked(tab: BrowserTab) -> bool {
    LOCKS.with(|locks| locks.borrow().contains_key(&tab))
}

fn toggle(locks: &mut HashSet<InputLock>, lock: InputLock, held: bool) {
    if held {
        locks.insert(lock);
    } else {
        locks.remove(&lock);
    }
}

// Changes `tab`'s locks. The tab ignores input while it has any, and waits
// for the keyboard no longer once it has none.
fn change(tab: BrowserTab, change: impl FnOnce(&mut HashSet<InputLock>)) {
    let (was_locked, locked) = LOCKS.with(|locks| {
        let mut locks = locks.borrow_mut();
        let mut on_tab = locks.remove(&tab).unwrap_or_default();
        let was_locked = !on_tab.is_empty();
        change(&mut on_tab);
        let locked = !on_tab.is_empty();
        if locked {
            locks.insert(tab, on_tab);
        }
        (was_locked, locked)
    });
    if !locked {
        WAITING.with(|waiting| waiting.borrow_mut().remove(&tab));
    }
    if locked != was_locked {
        // It fails only for a tab that has closed.
        let _ = tab.set_ignores_input(locked);
    }
}
