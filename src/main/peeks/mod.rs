// Peeks: a tab another opens, drawn in front of it, its back tab, with an
// overlay between them that blocks the back tab, until the person closes it,
// expands it into the list or sets it down in a split beside the page behind.
//
// A tab that opens peeks (`opens_peeks`), a pin's for now, makes one in two
// ways. Its page opens a tab in front, which becomes a peek as it first comes
// (settle.rs). Or it starts going to another origin, by a click or a script,
// and Wren sends that to a new tab in front instead (navigation.rs), which
// then becomes a peek the same way. The rest of the part takes any tab as
// the tab behind, a pin's or one of the list, as Development's Open Peek Tab
// shows (`open`).
//
// Which tab is a peek, and which tab it is in front of, is its role
// (tabs/roles.rs). What the part keeps beside it (`Peeks`) is the tabs
// already judged, and each peek's hold on the tabs behind it (hold.rs).
// settle.rs follows Chromium's changes with them, and navigation.rs says
// which tabs watch their navigations and what Wren answers each.

mod hold;
mod navigation;
mod settle;

pub use navigation::answer;
pub use settle::settle;

use std::cell::RefCell;
use std::collections::{HashMap, HashSet};

use wren::{Browser, BrowserTab, MainThread, SplitLayout};

use crate::app::State;
use crate::ipc;
use crate::pins;
use crate::tabs::{self, roles};
use crate::windows::BrowserWindow;

/// What the part keeps between Chromium's changes.
#[derive(Default)]
pub struct Peeks {
    // The tabs already judged as they first came, so each is judged once,
    // and a peek that became a tab of the list never becomes one again.
    judged: RefCell<HashSet<BrowserTab>>,
    // Each open peek's hold on the tabs behind it, by the peek.
    holds: RefCell<HashMap<BrowserTab, hold::Hold>>,
}

/// Whether `tab` opens peeks. Only a pin's tab does for now: nothing yet
/// turns them on for a tab of the list, though a peek in front of one
/// behaves as it does in front of a pin's.
pub fn opens_peeks(tab: BrowserTab) -> bool {
    roles::pin_of(tab).is_some()
}

/// `browser`'s active tab, if it is a peek, which the main menu's Open as
/// Tab expands (`expand_active`).
pub fn active(browser: &Browser) -> Option<BrowserTab> {
    browser
        .active_tab()
        .filter(|tab| roles::behind(*tab).is_some())
}

/// Opens `url` in a peek in front of `behind`, one of `browser`'s tabs, as
/// Development's Open Peek Tab does. `behind` needn't open peeks, as this
/// is how a peek is tried in front of any tab. A peek can't have one, and a
/// tab has one at most.
pub fn open(state: &State, browser: &Browser, behind: BrowserTab, url: &str) -> Result<(), String> {
    if roles::behind(behind).is_some() || roles::peek_of(behind).is_some() {
        return Err("That tab is a peek, or has one already.".into());
    }
    let tab = browser.add_tab(url, None, true).map_err(failed)?;
    roles::peek(tab, behind, pointer_over(state, browser)).map_err(failed)
}

/// Closes peek `tab`, as its Close button or a click on its overlay asks.
/// Its page may ask first. Once it has closed, the tab behind it takes
/// input again and is made active (settle.rs).
pub fn close(tab: BrowserTab) -> Result<(), String> {
    behind(tab)?;
    tab.close().map_err(failed)
}

/// Takes a picture of peek `tab`'s page as it is, at its own size, which the
/// page draws the peek by as it goes back into where it came from, and
/// gives `then` the ID it is served at (tabs/previews.rs). A tab that is no
/// peek, or gives none, gives `then` None.
pub fn picture(tab: BrowserTab, then: impl FnOnce(Option<String>) + 'static) {
    match roles::behind(tab) {
        Some(_) => tabs::previews::take_whole(tab, then),
        None => then(None),
    }
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

/// Expands `browser`'s active tab if it is a peek, as the main menu's Open
/// as Tab asks. `window`'s page does it as it does for the peek's own Open
/// as Tab button, so the peek grows to fill the tab before `expand` makes
/// it one.
pub fn expand_active(window: &BrowserWindow, browser: &Browser) {
    if let Some(tab) = active(browser) {
        ipc::send_expand_peek(window, tab);
    }
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

// Where the pointer is over the page of `browser`'s window, in whole points,
// for a peek coming now to grow out of: the link it was opened from, most
// often. None while it is beyond the page, as it is on the menu bar.
fn pointer_over(state: &State, browser: &Browser) -> Option<(i32, i32)> {
    let (x, y) = state.windows.of(browser)?.page.pointer()?;
    Some((x.round() as i32, y.round() as i32))
}

// The tab peek `tab` is in front of, or why there is none.
fn behind(tab: BrowserTab) -> Result<BrowserTab, String> {
    roles::behind(tab).ok_or_else(|| "That tab is not a peek.".into())
}

// Makes peek `tab` a tab of the list, its hold let go. Unpinned, Chromium
// puts it first among the tabs of the list.
fn to_list(peeks: &Peeks, tab: BrowserTab) {
    hold::let_go(peeks, tab);
    roles::release(tab);
}

fn failed(error: wren::Error) -> String {
    format!("{error:?}")
}
