// Go Back, from the main menu, its keys or a page's Back button: back in the
// active tab's history, or, with nothing to go back to, back to the tab that
// opened it. The tab closes, as Close Tab closes it (closes.rs), and once it
// has gone, the tab that opened it becomes active.

use std::rc::Rc;

use wren::BrowserTab;

use crate::analytics::TabFrom;
use crate::app::State;
use crate::windows::{self, BrowserWindow};

use super::{closes, failed};

/// Whether Go Back does anything in `window`'s `tab`: it can go back in its
/// history, or else back to the tab that opened it (`opener_to_return_to`).
pub fn can_go_back(window: &BrowserWindow, tab: BrowserTab) -> bool {
    tab.state().is_ok_and(|state| state.can_go_back) || opener_to_return_to(window, tab).is_some()
}

/// Go Back in `window`'s active tab. With nothing to go back to in its
/// history, the tab closes, as Close Tab closes it, and once it has gone,
/// the tab that opened it becomes active, from another of the window's
/// spaces too. A page that keeps its tab, as a "Leave site?" can, keeps it
/// active. A peek goes back into the tab behind it, which is most often the
/// one that opened it. Otherwise it does nothing.
pub fn go_back(state: &Rc<State>, window: &BrowserWindow) -> Result<(), String> {
    let browser = window.browser().ok_or("The window has no Browser yet.")?;
    let tab = browser.active_tab().ok_or("There is no tab.")?;
    if tab.state().is_ok_and(|state| state.can_go_back) {
        return tab.go_back().map_err(failed);
    }
    let Some(opener) = opener_to_return_to(window, tab) else {
        return Ok(());
    };
    // As its Close button takes it, and the tab behind it comes forward as
    // it closes (peeks/).
    if super::roles::behind(tab).is_some() {
        return closes::close_as_asked(state, window, &browser, tab, TabFrom::Back);
    }
    let weak = Rc::downgrade(state);
    let id = window.id;
    closes::close_then(state, &browser, tab, TabFrom::Back, move || {
        let Some(state) = weak.upgrade() else { return };
        let Some(window) = state.windows.get(id) else {
            return;
        };
        if let Err(error) = return_to(&state, &window, opener) {
            eprintln!("Wren could not return to the tab that opened the one closed: {error}");
        }
    })
}

// The tab whose page opened `tab`, while it is open in one of `window`'s
// spaces and `tab` has nothing to go back to in its history.
fn opener_to_return_to(window: &BrowserWindow, tab: BrowserTab) -> Option<BrowserTab> {
    let state = tab.state().ok()?;
    if state.can_go_back {
        return None;
    }
    let opener = state.opened_by?;
    opener
        .browser()
        .is_some_and(|browser| window.has_browser(&browser))
        .then_some(opener)
}

// Makes `opener` the active tab of `window`, bringing its space forward if
// it is another's, unless it has closed or left the window meanwhile.
fn return_to(state: &State, window: &BrowserWindow, opener: BrowserTab) -> Result<(), String> {
    let Some(browser) = opener
        .browser()
        .filter(|browser| window.has_browser(browser))
    else {
        return Ok(());
    };
    opener.activate().map_err(failed)?;
    if window.browser().as_ref() == Some(&browser) {
        return Ok(());
    }
    let space = window.space_of(&browser).ok_or("The tab is in no space.")?;
    windows::show_space(state, window.id, space)
}
