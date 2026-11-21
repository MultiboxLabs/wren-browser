// Mini Wren, a small browser window for one page, with no sidebar. A
// Browser Chromium opens that is not a tabbed window gets one: a page's
// popup (`window.open` with features, as a sign-in opens), an extension's
// popup window, or an installed app's window. Wren opens one itself too,
// for a link from another app, a link from a page's context menu, or empty
// from New Mini Wren (from_apps.rs). It is a panel: it takes the keyboard
// with Wren left in the background and its other windows where they are, as
// Spotlight does, and using it never brings Wren forward. Its page draws a
// toolbar, whose address opens the omnibox for its page, above the page
// (pages/ui/mini-wren.tsx). On the New Tab page, as an empty one opens, it
// is the omnibox alone instead, which is never full screen
// (`follow_new_tab_page`). It is on its profile's place, and never kept:
// its Browser closing takes it (close.rs). Its page can move to a tab of a
// window the user browses in (as_tab.rs). What the main menu's commands do
// in one is commands.rs's. Document Picture-in-Picture is none of these:
// Chromium shows it in a window of its own, with no Browser.

mod as_tab;
mod commands;
mod from_apps;

pub use as_tab::open_as_tab;
pub use commands::command;
use from_apps::moved_to_tab;
pub(crate) use from_apps::take_key;
pub(crate) use from_apps::{HeldMiniWren, MiniWrens};
pub use from_apps::{closed, open_empty, open_link};
pub(in crate::windows) use from_apps::{hold, open_held, window_used};

use std::rc::Rc;

use wren::{Browser, MainThread, WindowFeatures};

use super::session::unkept_window_key;
use crate::app::State;
use crate::db::SpaceId;
use crate::ipc;
use crate::menus;
use crate::platform::Backdrop;
use crate::tabs;
use crate::windows::{self, BrowserWindow, MiniWren, Place, WindowId};

/// The height of a Mini Wren's toolbar, in points, which the page draws
/// above its page (pages/ui/mini-wren.tsx). The size a page asks for is its
/// own, so the window is this much taller.
const TOOLBAR: f64 = 40.0;

/// The size of a Mini Wren's page that asked for none.
const PAGE_SIZE: (f64, f64) = (800.0, 600.0);

/// A Mini Wren's window on the New Tab page: the omnibox's size in the
/// middle of a window (`sizes.center`, components/omnibox/omnibox.tsx).
/// Change the two together.
const NEW_TAB_PAGE_SIZE: (f64, f64) = (763.0, 326.0);

/// How far a Mini Wren's window placed at the pointer, or resized, stays
/// inside the screen's usable area, on each side, in points.
const SCREEN_MARGIN: f64 = 20.0;

/// A Mini Wren's window's minimum, its toolbar in it, however small its
/// page asks to be: room for the window's buttons, some of the address, and
/// the button that opens the page as a tab with its key and its menu of
/// spaces.
pub(super) const MINI_WREN_MIN_SIZE: (f64, f64) = (400.0, 160.0);

/// Where a Mini Wren's window goes.
enum MiniWrenPosition {
    /// Where its page asked, if a screen shows it there, or else cascaded
    /// from `near`, or the window in front: one for a page or Chromium.
    AsAsked { near: Option<Rc<BrowserWindow>> },
    /// Centred on the pointer, on its screen: one the user opened
    /// (from_apps.rs).
    AtPointer,
}

/// Shows `browser`, a popup Chromium opened, which `opener` opened if
/// Chromium names it, in a Mini Wren (`show`), from the space
/// its opener's window opened it from, and cascaded from that window.
pub fn open_popup(state: &Rc<State>, mt: MainThread, browser: Browser, opener: Option<Browser>) {
    let opener_window = opener.as_ref().and_then(|opener| state.windows.of(opener));
    let space = opener_window
        .as_ref()
        .zip(opener.as_ref())
        .and_then(|(window, opener)| window.space_opened_from(opener));
    let position = MiniWrenPosition::AsAsked {
        near: opener_window,
    };
    show(state, mt, browser, space, position);
}

/// Shows `browser` in a Mini Wren, from `space`, as large as its page
/// asked, at `position`; on the New Tab page, as the omnibox alone, at
/// its size. One that gets no window closes. Answers the window's ID.
fn show(
    state: &Rc<State>,
    mt: MainThread,
    browser: Browser,
    space: Option<SpaceId>,
    position: MiniWrenPosition,
) -> Option<WindowId> {
    let Some(profile) = browser.profile() else {
        browser.close(|_| {});
        return None;
    };
    let mini_wren = MiniWren {
        space,
        address: browser
            .window_features()
            .contains(WindowFeatures::LOCATION_BAR),
    };
    let place = Place::of_profile(&profile);
    let window = windows::open_page_window(
        state,
        mt,
        unkept_window_key(),
        Some(place.clone()),
        true,
        Some(mini_wren),
    );
    let Some(window) = window else {
        browser.close(|_| {});
        return None;
    };
    // Drawn as it is to be before it is placed, and long before it
    // shows.
    let on_new_tab_page = is_on_new_tab_page(mini_wren, &browser) == Some(true);
    window.set_on_new_tab_page(on_new_tab_page);
    window.page.set_backdrop(backdrop(on_new_tab_page));
    window.page.allow_full_screen(!on_new_tab_page);
    let size = window_size(on_new_tab_page, &browser);
    let requested = browser.requested_bounds();
    match position {
        MiniWrenPosition::AsAsked { near } => {
            let near = near.or_else(|| state.windows.front());
            window.page.place_as_asked(
                size,
                requested.and_then(|bounds| bounds.origin),
                near.as_ref().map(|near| &near.page),
            );
        }
        MiniWrenPosition::AtPointer => window.page.place_at_pointer(size, SCREEN_MARGIN),
    }
    windows::host_as_requested(state, &window, place, &browser);
    Some(window.id)
}

/// Draws Mini Wren `window` as the omnibox alone once its page has gone
/// to the New Tab page, or with its toolbar and page again once it has
/// left it, as what the omnibox opens loads there, and the page has the
/// keyboard, which the omnibox kept until then. The window grows or
/// shrinks from its top to the size of what it shows, and its backdrop
/// is a panel's while it is the omnibox, which is never full screen: a
/// window in full screen leaves it first. The page draws it so
/// ("window.newTabPage"), and the main menu follows. Nothing for a
/// browser window.
pub fn follow_new_tab_page(state: &State, mt: MainThread, window: &BrowserWindow) {
    let Some((mini_wren, browser)) = window.mini_wren().zip(window.browser()) else {
        return;
    };
    let Some(on_new_tab_page) = is_on_new_tab_page(mini_wren, &browser) else {
        return;
    };
    if !window.set_on_new_tab_page(on_new_tab_page) {
        return;
    }
    window.page.set_backdrop(backdrop(on_new_tab_page));
    window.page.allow_full_screen(!on_new_tab_page);
    window.resize_from_top(window_size(on_new_tab_page, &browser), SCREEN_MARGIN);
    ipc::send_new_tab_page(window);
    menus::update_front_menu(state, mt);
    if !on_new_tab_page && let Some(tab) = browser.active_tab() {
        tabs::input::give_keyboard(tab);
    }
}

/// Window `window` went out of use, having been in use: a Mini Wren on
/// the New Tab page closes, as it is done with, and leaves the user
/// where they went.
pub(super) fn window_left(state: &Rc<State>, mt: MainThread, window: &BrowserWindow) {
    if window.is_on_new_tab_page() {
        windows::close(state, mt, window.id);
    }
}

// Whether a Mini Wren on `browser` is drawn as the omnibox alone: it shows
// its address, and its page is the New Tab page. None while the page has
// no address yet, as a page's popup has none at first, which leaves the
// window as it is.
fn is_on_new_tab_page(mini_wren: MiniWren, browser: &Browser) -> Option<bool> {
    let url = browser.active_tab()?.url();
    (!url.is_empty()).then(|| mini_wren.address && tabs::is_new_tab(&url))
}

// What shows through a Mini Wren's page: a panel's clearer blur while it is
// the omnibox alone, which is one panel; or else a window's.
fn backdrop(on_new_tab_page: bool) -> Backdrop {
    if on_new_tab_page {
        Backdrop::Panel
    } else {
        Backdrop::Window
    }
}

// The size of a Mini Wren's window on `browser`: the omnibox's on the New
// Tab page; or else as large as its page asked, or a Mini Wren's own size,
// and its toolbar.
fn window_size(on_new_tab_page: bool, browser: &Browser) -> (f64, f64) {
    if on_new_tab_page {
        return NEW_TAB_PAGE_SIZE;
    }
    let requested = browser.requested_bounds();
    let (width, height) = requested.map_or(PAGE_SIZE, |bounds| (bounds.width, bounds.height));
    (width, height + TOOLBAR)
}
