// What an open peek holds on the tabs behind it: a lock on their input
// (tabs/input.rs), so the overlay is all they take, and the tab behind
// itself, which is made active again if the peek closes while it is.
// settle.rs keeps the holds as Chromium changes the tabs, and an action that
// sends a peek to the list lets its hold go (mod.rs).

use wren::{Browser, BrowserTab};

use super::Peeks;
use crate::tabs::input::{self, InputLock};
use crate::tabs::{self, roles};

/// An open peek's hold on the tabs behind it.
pub(super) struct Hold {
    // The tab it is in front of.
    behind: BrowserTab,
    // The tabs whose input it locks: the tab behind, and the other of its
    // split.
    locked: Vec<BrowserTab>,
    // It was its Browser's active tab at the last change, so the tab behind
    // it is made active if it closes.
    active: bool,
}

/// Makes each of `browser`'s peeks active in place of the tabs behind it,
/// should one of them be, as the tab behind a peek is never shown alone.
pub(super) fn keep_in_front(browser: &Browser) {
    let Some(active) = browser.active_tab() else {
        return;
    };
    for (tab, behind) in roles::peeks(browser) {
        if tabs::with_split(behind).contains(&active) {
            // It fails only for a tab that has closed.
            let _ = tab.activate();
        }
    }
}

/// Holds a lock on the input of the tabs behind each of `browser`'s peeks,
/// following the tab behind into a split or out of one, and notes whether
/// the peek is active.
pub(super) fn hold_behind(peeks: &Peeks, browser: &Browser) {
    let active = browser.active_tab();
    let mut holds = peeks.holds.borrow_mut();
    for (tab, behind) in roles::peeks(browser) {
        let locked = tabs::with_split(behind);
        let hold = holds.entry(tab).or_insert_with(|| Hold {
            behind,
            locked: Vec::new(),
            active: false,
        });
        for gone in hold.locked.iter().filter(|each| !locked.contains(each)) {
            input::set_on_tab(*gone, InputLock::Peek, false);
        }
        for each in &locked {
            input::set_on_tab(*each, InputLock::Peek, true);
        }
        hold.locked = locked;
        hold.active = active == Some(tab);
    }
}

/// Lets go the hold of each peek that has closed, or is no longer a peek,
/// in any Browser. The tab behind one that closed while it was active is
/// made active.
pub(super) fn end_released(peeks: &Peeks) {
    let ended: Vec<BrowserTab> = peeks
        .holds
        .borrow()
        .keys()
        .filter(|tab| roles::behind(**tab).is_none() || tab.browser().is_none())
        .copied()
        .collect();
    for tab in ended {
        let closed = tab.browser().is_none();
        if let Some(hold) = let_go(peeks, tab)
            && closed
            && hold.active
        {
            // It fails only for a tab that has closed too.
            let _ = hold.behind.activate();
        }
    }
}

/// Lets go peek `tab`'s hold on the tabs behind it, as it closes or is no
/// longer a peek, and answers the hold it had.
pub(super) fn let_go(peeks: &Peeks, tab: BrowserTab) -> Option<Hold> {
    let hold = peeks.holds.borrow_mut().remove(&tab)?;
    for locked in &hold.locked {
        input::set_on_tab(*locked, InputLock::Peek, false);
    }
    Some(hold)
}
