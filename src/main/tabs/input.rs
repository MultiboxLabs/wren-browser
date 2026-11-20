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

impl WindowInputLocks {
    fn holds(&self, lock: InputLock) -> bool {
        self.0.borrow().contains(&lock)
    }
}

thread_local! {
    // By tab, whose ID is the app's own whichever Browser it is in. A tab
    // with no lock on it has no entry.
    static LOCKS: RefCell<HashMap<BrowserTab, HashSet<InputLock>>> = RefCell::default();
}

/// Holds `lock` on `window`'s tabs, or lets it go.
pub fn set_on_window(window: &BrowserWindow, lock: InputLock, held: bool) {
    let was_locked = !window.input_locks.0.borrow().is_empty();
    {
        let mut locks = window.input_locks.0.borrow_mut();
        if held {
            locks.insert(lock);
        } else {
            locks.remove(&lock);
        }
    }
    for browser in window.browsers() {
        for tab in browser.tabs() {
            set(tab, lock, held);
        }
    }
    // A tab that ignores input can still take keys from an input method and
    // the Tab key, so the page takes the keyboard from it.
    if held && !was_locked {
        let _ = window.page.web_view.focus();
    }
}

/// Lets go every lock `window`'s page held, as the page has gone.
pub fn page_gone(window: &BrowserWindow) {
    let held: Vec<InputLock> = window.input_locks.0.borrow().iter().copied().collect();
    for lock in held {
        set_on_window(window, lock, false);
    }
}

/// Gives `browser`'s tabs the locks `window` holds on all its tabs, and
/// takes off those of a window they were in before, as it comes to the
/// window and as tabs come to it.
pub fn follow(window: &BrowserWindow, browser: &Browser) {
    for tab in browser.tabs() {
        let window_wide: Vec<InputLock> = LOCKS.with(|locks| {
            locks.borrow().get(&tab).map_or_else(Vec::new, |on_tab| {
                on_tab
                    .iter()
                    .copied()
                    .filter(|lock| lock.is_window_wide())
                    .collect()
            })
        });
        for lock in window_wide {
            set(tab, lock, window.input_locks.holds(lock));
        }
        for lock in window.input_locks.0.borrow().iter().copied() {
            set(tab, lock, true);
        }
    }
}

/// Forgets the locks of tabs that have closed.
pub fn forget_closed() {
    LOCKS.with(|locks| locks.borrow_mut().retain(|tab, _| tab.browser().is_some()));
}

// Puts `lock` on `tab`, or takes it off. The tab ignores input while its
// list has any.
fn set(tab: BrowserTab, lock: InputLock, held: bool) {
    let changed = LOCKS.with(|locks| {
        let mut locks = locks.borrow_mut();
        let was_locked = locks.contains_key(&tab);
        if held {
            locks.entry(tab).or_default().insert(lock);
        } else if let Some(on_tab) = locks.get_mut(&tab) {
            on_tab.remove(&lock);
            if on_tab.is_empty() {
                locks.remove(&tab);
            }
        }
        was_locked != locks.contains_key(&tab)
    });
    if changed {
        // It fails only for a tab that has closed.
        let _ = tab.set_ignores_input(held);
    }
}
