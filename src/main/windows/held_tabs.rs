// Pages to open in new tabs of the window the user browses in, which comes
// forward: the app's own pages a menu item shows (show_page.rs), and links
// from other apps while Settings opens them in tabs (open_urls.rs). Each is
// held until startup and the restore are done (`open_held`), and until that
// window has its Browser (`open_browser`).

use std::rc::Rc;

use wren::MainThread;

use crate::app::State;
use crate::tabs;
use crate::windows;

/// Opens `urls` in new tabs of the window the user browses in, now or
/// once the app can, the first in front.
pub(super) fn hold(state: &Rc<State>, mt: MainThread, urls: impl IntoIterator<Item = String>) {
    state.held_tabs.borrow_mut().extend(urls);
    windows::open_held(state, mt);
}

/// Opens the pages held in the window the user browses in, if it has its
/// Browser; else the Browser is made, and they open as it is shown. With
/// no window to open them in, one opens on the space used last, as the
/// Dock icon's does.
pub(super) fn open_held(state: &Rc<State>, mt: MainThread) {
    if state.held_tabs.borrow().is_empty() {
        return;
    }
    let Some(window) = windows::browsing_window(state) else {
        return windows::open_recent(state, mt);
    };
    let Some(browser) = window.browser() else {
        // A place without one gets one, unless it is on the way; a
        // window that waits for its first has it on the way.
        if let Some(place) = window.place() {
            windows::open_browser(state, mt, window.id, place, || {});
        }
        return;
    };
    let urls = state.held_tabs.take();
    // The first ends up first in the list, and in front.
    for url in urls.iter().rev() {
        if let Err(error) = tabs::open(state, &browser, url, None) {
            eprintln!("Wren could not open {url}: {error:?}");
        }
    }
    window.page.bring_forward();
}
