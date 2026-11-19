// The app's windows: opening them, the Browsers in them, and the spaces they
// show. A window shows one space at a time, and has at most one Browser for
// each space it has been on, which stays in the background while another
// space is in front; a space may have none. A Mini Wren shows one Browser,
// and no space. Its files:
//
// - open.rs: opening windows;
// - browsers.rs: where each Browser goes, and getting it into its window;
// - open_urls.rs: the links macOS asks the app to open, in Mini Wren;
// - mini_wren/: Mini Wren, the window of a popup, a link from another app,
//   or New Mini Wren, and moving its page to a tab;
// - show_page.rs: the app's own pages a menu item shows, in tabs;
// - switch.rs: switching a window between its spaces;
// - move_tabs.rs: moving tabs from one of its spaces to another;
// - session.rs: keeping the windows, so each comes back as it was;
// - request.rs: what Chromium asks of a window, done;
// - close.rs: the close button, ⌘W, and a window as one of its Browsers
//   closes;
// - devtools.rs: the window of Chromium's undocked DevTools.
//
// What a window is, and holds, is window/'s: `BrowserWindow`, the places it
// shows Browsers for and the tag each Browser carries. list.rs is the list
// of the windows that are open. The window round a window's page is the
// platform's (`platform::PageWindow`).

mod browsers;
mod close;
mod devtools;
mod list;
pub mod mini_wren;
mod move_tabs;
mod open;
mod open_urls;
mod request;
mod session;
mod show_page;
mod switch;
mod window;

use browsers::{host_as_requested, open_profile_of};
pub use browsers::{open_browser, place_opened, with_browser_of};
pub use close::{browser_closed, close, close_tab};
pub use devtools::DevTools;
pub use list::Windows;
use move_tabs::show_brought;
pub use move_tabs::{may_bring, move_to_place, profile_shown, remakes_for};
pub(crate) use open::count_crashes;
pub use open::{new_incognito_window, new_window, open, open_for_profile, open_recent};
use open::{open_keyed, open_page_window};
pub use open_urls::open_urls;
use request::start_as_requested;
pub use request::{answer_request, fullscreen};
pub use session::{forget, is_restoring, open_saved, restore_sessions, save, save_frame};
use session::{is_left_by_closed_window, new_key, place_tagged};
pub(crate) use session::{restore_finished, restore_started};
use show_page::open_held_pages;
pub use show_page::show_page;
pub use switch::{
    cancel_new_space, foreground_requested, leave_gone_profiles, leave_gone_spaces, new_space,
    show_space, switch_space,
};
pub use window::{BrowserWindow, MiniWren, Place, Tag, WindowId, marks};

use std::rc::Rc;

use wren::MainThread;

use crate::app::State;

/// Names `window` for its active tab, or with none, for the space it
/// shows, or the profile, as the page names it; or for the space the
/// user makes.
pub fn update_title(state: &State, window: &BrowserWindow) {
    let tab = window
        .active_tab()
        .map(|tab| tab.title())
        .filter(|title| !title.is_empty());
    let making = window.left_space().map(|_| "New Space".to_owned());
    let title = tab.or(making).or_else(|| match window.place()? {
        Place::Space(space) => Some(state.db.space(space).ok()??.name),
        Place::Profile {
            off_the_record: true,
            ..
        } => Some("Incognito".into()),
        Place::Profile { id, .. } => MainThread::get()?
            .profile_list()
            .into_iter()
            .find(|entry| entry.id == id)
            .map(|entry| entry.name),
    });
    window.page.set_title(title.as_deref().unwrap_or("Wren"));
}

/// Opens the Mini Wren and the app's own pages held, if the app can now:
/// not before startup opens the windows, nor while restoring.
pub(super) fn open_held(state: &Rc<State>, mt: MainThread) {
    if state.ui_profile.borrow().is_none() || is_restoring(state) {
        return;
    }
    mini_wren::open_held(state, mt);
    open_held_pages(state, mt);
}

/// The window the user browses in, or else the newest other, that
/// what the app opens for the user goes to. Never a Mini Wren, nor off the
/// record, as Chromium opens links in a normal window; nor one on no
/// space while the user makes one.
pub(super) fn browsing_window(state: &State) -> Option<Rc<BrowserWindow>> {
    state.windows.taking(|window| {
        !window.is_closing()
            && window.left_space().is_none()
            && !window
                .place()
                .is_some_and(|place| place.is_off_the_record())
    })
}
