// Peeks: a tab another opens, drawn in front of it, its back tab, with an
// overlay between them that blocks the back tab, until the person closes it,
// expands it into the list or sets it down in a split beside the page behind.
//
// A tab that opens peeks (`opens_peeks`), a pin's for now, makes one in two
// ways. Its page opens a tab in front, which becomes a peek as it first comes
// (settle.rs). Or it starts going to another origin, by a click or a script,
// and Wren sends that to a new tab in front instead (navigation.rs), which
// then becomes a peek the same way. The rest of the part takes any tab as
// the tab behind, a pin's or one of the list.
//
// Which tab is a peek, and which tab it is in front of, is its role
// (tabs/roles.rs). What the part keeps beside it (`Peeks`) is the tabs
// already judged, and each peek's hold on the input of the tabs behind it.

mod navigation;
mod settle;

pub use navigation::answer;
pub use settle::settle;

use std::cell::RefCell;
use std::collections::{HashMap, HashSet};

use wren::{Browser, BrowserTab, MainThread, SplitLayout};

use crate::app::State;
use crate::pins;
use crate::tabs::input::{self, InputLock};
use crate::tabs::{self, roles};

/// What the part keeps between Chromium's changes.
#[derive(Default)]
pub struct Peeks {
    // The tabs already judged as they first came, so each is judged once,
    // and a peek that became a tab of the list never becomes one again.
    judged: RefCell<HashSet<BrowserTab>>,
    // Each open peek's hold on the tabs behind it, by the peek.
    holds: RefCell<HashMap<BrowserTab, Hold>>,
}

// An open peek's hold on the tabs behind it.
struct Hold {
    // The tab it is in front of.
    behind: BrowserTab,
    // The tabs whose input it locks: the tab behind, and the other of its
    // split.
    locked: Vec<BrowserTab>,
    // It was its Browser's active tab at the last change, so the tab behind
    // it is made active if it closes.
    active: bool,
}

/// Whether `tab` opens peeks. Only a pin's tab does for now: nothing yet
/// turns them on for a tab of the list, though a peek in front of one
/// behaves as it does in front of a pin's.
pub fn opens_peeks(tab: BrowserTab) -> bool {
    roles::pin_of(tab).is_some()
}

/// Closes peek `tab`, as its Close button or a click on its overlay asks.
/// Its page may ask first. Once it has closed, the tab behind it takes
/// input again and is made active (settle.rs).
pub fn close(tab: BrowserTab) -> Result<(), String> {
    behind(tab)?;
    tab.close().map_err(failed)
}

/// Makes peek `tab` a tab of the list, at its top, and still active, as its
/// Expand button asks. The tab behind it takes input again.
pub fn expand(
    state: &State,
    mt: MainThread,
    browser: &Browser,
    tab: BrowserTab,
) -> Result<(), String> {
    behind(tab)?;
    to_list(&state.peeks, tab);
    tabs::move_tab(mt, browser, tab, 0, None).map_err(failed)?;
    tab.activate().map_err(failed)
}

/// Sets peek `tab` down in a split beside the page behind it, as its Split
/// button asks, the page behind on the left and the peek on the right,
/// which stays active. A pin's tab behind leaves its pin (`pins::unlink`),
/// and the split goes to the top of the list. A tab of the list behind
/// makes the split where it is. A peek in front of a split can't, as a
/// split has no third side.
pub fn split(
    state: &State,
    mt: MainThread,
    browser: &Browser,
    tab: BrowserTab,
) -> Result<(), String> {
    let behind = behind(tab)?;
    if tabs::split_of(behind).is_some() {
        return Err("A peek in front of a split makes no split.".into());
    }
    let pin = roles::pin_of(behind);
    if let Some(pin) = pin {
        pins::unlink(browser, pin)?;
    }
    to_list(&state.peeks, tab);
    let split = behind
        .split_with(tab, SplitLayout::SideBySide)
        .map_err(failed)?;
    if pin.is_some() {
        tabs::move_split(mt, browser, split, 0, None).map_err(failed)?;
    }
    tab.activate().map_err(failed)
}

// The tab peek `tab` is in front of, or why there is none.
fn behind(tab: BrowserTab) -> Result<BrowserTab, String> {
    roles::behind(tab).ok_or_else(|| "That tab is not a peek.".into())
}

// Makes peek `tab` a tab of the list, its hold let go. Unpinned, Chromium
// puts it first among the tabs of the list.
fn to_list(peeks: &Peeks, tab: BrowserTab) {
    let_go(peeks, tab);
    roles::release(tab);
}

// Lets go peek `tab`'s hold on the tabs behind it, as it closes or is no
// longer a peek, and answers the hold it had.
fn let_go(peeks: &Peeks, tab: BrowserTab) -> Option<Hold> {
    let hold = peeks.holds.borrow_mut().remove(&tab)?;
    for locked in &hold.locked {
        input::set_on_tab(*locked, InputLock::Peek, false);
    }
    Some(hold)
}

fn failed(error: wren::Error) -> String {
    format!("{error:?}")
}
