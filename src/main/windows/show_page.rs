// The app's own pages a menu item shows, such as Import: each opens in a new
// tab of the window the user browses in (held_tabs.rs), or brings forward
// the tab that has one already.

use std::rc::Rc;

use wren::MainThread;

use super::held_tabs;
use crate::app::State;
use crate::pages::Page;
use crate::windows;

/// Shows the app's own `page` in the window the user browses in: the tab
/// there on it, if one is, or else a new one.
pub fn show_page(state: &Rc<State>, mt: MainThread, page: &Page) {
    let url = page.url();
    let window = windows::browsing_window(state);
    let tab = window
        .as_ref()
        .and_then(|window| window.browser())
        .and_then(|browser| {
            browser
                .tabs()
                .into_iter()
                .find(|tab| tab.url().starts_with(&url))
        });
    match (window, tab) {
        (Some(window), Some(tab)) => {
            if let Err(error) = tab.activate() {
                eprintln!("Wren could not show {url}: {error:?}");
            }
            window.page.bring_forward();
        }
        _ => held_tabs::hold(state, mt, [url]),
    }
}
