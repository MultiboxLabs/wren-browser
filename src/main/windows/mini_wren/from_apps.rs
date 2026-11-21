// The Mini Wren that Wren opens itself, with no page to open it: one for
// each link from another app (open_urls.rs), one for a link from a page's
// context menu (`open_link`), and an empty one from New Mini Wren, whose
// key works in any app, on the New Tab page, where it is the omnibox alone
// (mod.rs). Each is in front and centred on the pointer, where the user is
// looking. One from another app or New Mini Wren opens from the space of
// the window the user browses in, or else the space used last. One from a
// page's context menu opens on that page's profile and from its space. None
// adds to a space's tabs unless the user opens it as a tab.
//
// One asked for before its profile has opened, as a link that launches the
// app is, or while a profile's last session is being restored, which brings
// forward what it had active, is held, and opens once startup and the
// restore are done (`open_held`).
//
// Each keeps the app that was in front as it was asked for, if that was not
// Wren: the app that sent its link, or the one New Mini Wren's key was
// pressed in. If it closes while it is the window in use, and the user has
// gone to no other window of the app since it opened, that app comes back
// to the front, as if the Mini Wren had been a part of it.
//
// Each opens with its page at the size the user last gave one, kept as they
// finish resizing it (db/mini_wren.rs), or else at a Mini Wren's own size.
// One a page or Chromium opens is as large as its page asks, and keeps
// nothing.

use std::cell::RefCell;
use std::collections::HashMap;
use std::rc::Rc;

use wren::{Browser, MainThread, Profile, RequestedBounds};

use super::{MiniWrenPosition, PAGE_SIZE, TOOLBAR};
use crate::app::State;
use crate::db::SpaceId;
use crate::menus;
use crate::platform::{self, GlobalShortcut, RunningApp};
use crate::windows::{self, BrowserWindow, Place, WindowId};

/// Chromium's New Tab page, where an empty Mini Wren opens.
const NEW_TAB_PAGE: &str = "chrome://newtab/";

/// A Mini Wren asked for, until the app can open it.
pub(crate) struct HeldMiniWren {
    pub url: String,
    /// The app it goes back to as it closes.
    pub return_to: Option<RunningApp>,
}

/// What Mini Wren keeps between calls.
#[derive(Default)]
pub(crate) struct MiniWrens {
    /// New Mini Wren's key, taken from every app.
    shortcut: RefCell<Option<GlobalShortcut>>,
    /// The Mini Wren asked for before the app could open them.
    held: RefCell<Vec<HeldMiniWren>>,
    /// The app each Mini Wren goes back to as it closes: the one that sent
    /// its link, or that was in front as it opened empty, until the user
    /// goes to another window.
    returns_to: RefCell<HashMap<WindowId, RunningApp>>,
}

/// Takes New Mini Wren's key from every app, so that it opens one
/// wherever the user is. A performance run leaves the key to the user's
/// own Wren.
pub(crate) fn take_key(state: &Rc<State>, mt: MainThread) {
    if state.perf.is_some() {
        return;
    }
    let weak = Rc::downgrade(state);
    let shortcut = GlobalShortcut::new(&menus::mini_wren_key(), move || {
        if let Some(state) = weak.upgrade() {
            open_empty(&state, mt);
        }
    });
    if shortcut.is_none() {
        eprintln!("Wren could not take New Mini Wren's key from other apps.");
    }
    *state.mini_wrens.shortcut.borrow_mut() = shortcut;
}

/// Opens an empty Mini Wren, on the New Tab page, now or once the app
/// can, which goes back to the app in front as it closes, if that is
/// not Wren.
pub fn open_empty(state: &Rc<State>, mt: MainThread) {
    let held = HeldMiniWren {
        url: NEW_TAB_PAGE.to_owned(),
        return_to: platform::frontmost_other_app(),
    };
    hold(state, mt, [held]);
}

/// Opens `url` in a Mini Wren, on `opener`'s profile and from its space,
/// or else where a Mini Wren from another app opens.
pub fn open_link(state: &Rc<State>, mt: MainThread, url: String, opener: Option<Browser>) {
    let origin = opener.as_ref().and_then(|browser| {
        let profile = browser.profile()?;
        let space = state
            .windows
            .of(browser)
            .and_then(|window| window.space_opened_from(browser));
        Some((profile, space))
    });
    if let Some((profile, space)) = origin {
        open_on(state, mt, &profile, &url, space, None);
    } else {
        hold(
            state,
            mt,
            [HeldMiniWren {
                url,
                return_to: None,
            }],
        );
    }
}

/// Opens a Mini Wren for each of `held`, now or once the app can.
pub(in crate::windows) fn hold(
    state: &Rc<State>,
    mt: MainThread,
    held: impl IntoIterator<Item = HeldMiniWren>,
) {
    state.mini_wrens.held.borrow_mut().extend(held);
    windows::open_held(state, mt);
}

/// Opens each Mini Wren held.
pub(in crate::windows) fn open_held(state: &Rc<State>, mt: MainThread) {
    if state.mini_wrens.held.borrow().is_empty() {
        return;
    }
    let Some(place) = place_to_open(state) else {
        return;
    };
    // Each comes in front of the last, so the first is in front.
    for held in state.mini_wrens.held.take().into_iter().rev() {
        open(state, mt, held, place.clone());
    }
}

// Where a Mini Wren opens: the place of the window the user browses in,
// or the space used last. None if there is no space, or the spaces could
// not be read.
fn place_to_open(state: &State) -> Option<Place> {
    if let Some(place) = windows::browsing_window(state).and_then(|window| window.place()) {
        return Some(place);
    }
    match state.db.most_recent_space() {
        Ok(Some(space)) => Some(Place::Space(space.id)),
        Ok(None) => {
            eprintln!("Wren found no space to open a Mini Wren from.");
            None
        }
        Err(error) => {
            eprintln!("Wren could not read the spaces: {error}");
            None
        }
    }
}

// Opens `held` in a Mini Wren of its own on `place`'s profile, with no
// opener, from `place` if it is a space, centred on the pointer.
fn open(state: &Rc<State>, mt: MainThread, held: HeldMiniWren, place: Place) {
    let HeldMiniWren { url, return_to } = held;
    let space = place.space();
    windows::open_profile_of(state, mt, place, {
        let state = state.clone();
        move |profile| {
            let profile = match profile {
                Ok(profile) => profile,
                Err(error) => return eprintln!("Wren could not open a Mini Wren: {error}"),
            };
            open_on(&state, mt, &profile, &url, space, return_to);
        }
    });
}

// Opens `url` in a Mini Wren on `profile`, from `space`, at the user's
// kept size and centred on the pointer.
fn open_on(
    state: &Rc<State>,
    mt: MainThread,
    profile: &Profile,
    url: &str,
    space: Option<SpaceId>,
    return_to: Option<RunningApp>,
) {
    // No page asks for a size, so it gets the one the user last gave.
    let (width, height) = kept_page_size(state);
    let size = RequestedBounds {
        origin: None,
        width,
        height,
    };
    let state = state.clone();
    profile.create_popup_browser(url, Some(size), move |browser| match browser {
        Ok(browser) => {
            let Some(window) = super::show(&state, mt, browser, space, MiniWrenPosition::AtPointer)
            else {
                return;
            };
            keep_page_size(&state, window);
            if let Some(app) = return_to {
                state.mini_wrens.returns_to.borrow_mut().insert(window, app);
            }
        }
        Err(error) => eprintln!("Wren could not open a Mini Wren: {error:?}"),
    });
}

// The size of the page the user last gave a Mini Wren that Wren opened,
// or else a Mini Wren's own.
fn kept_page_size(state: &State) -> (f64, f64) {
    match state.db.mini_wren_page_size() {
        Ok(size) => size.unwrap_or(PAGE_SIZE),
        Err(error) => {
            eprintln!("Wren could not read Mini Wren's size: {error}");
            PAGE_SIZE
        }
    }
}

// Keeps the size the user gives Mini Wren `id`'s page as they finish
// resizing it, for the next one to open at. On the New Tab page the
// window is the omnibox's, which has no page, and full screen its size
// is the screen's, not the user's.
fn keep_page_size(state: &Rc<State>, id: WindowId) {
    let Some(window) = state.windows.get(id) else {
        return;
    };
    let weak = Rc::downgrade(state);
    window.page.watch_resized(move || {
        let Some(state) = weak.upgrade() else { return };
        let Some(window) = state.windows.get(id) else {
            return;
        };
        if window.is_on_new_tab_page() || window.page.is_full_screen() {
            return;
        }
        let (width, height) = window.page.content_size();
        if let Err(error) = state.db.set_mini_wren_page_size((width, height - TOOLBAR)) {
            eprintln!("Wren could not keep Mini Wren's size: {error}");
        }
    });
}

/// Window `id` came into use: no Mini Wren but it goes back to its app
/// as it closes.
pub(in crate::windows) fn window_used(state: &State, id: WindowId) {
    state
        .mini_wrens
        .returns_to
        .borrow_mut()
        .retain(|window, _| *window == id);
}

/// Mini Wren `id`'s page moved to a tab, where it goes on: its window
/// closes without going back to its app.
pub(super) fn moved_to_tab(state: &State, id: WindowId) {
    state.mini_wrens.returns_to.borrow_mut().remove(&id);
}

/// Mini Wren `window` is closing: if it keeps an app, and it is still
/// the window in use, that app comes back to the front.
pub fn closed(state: &State, window: &BrowserWindow) {
    let app = state.mini_wrens.returns_to.borrow_mut().remove(&window.id);
    if let Some(app) = app.filter(|_| window.page.is_active())
        && !platform::activate_app(&app.id)
    {
        eprintln!("Wren could not go back to {}.", app.name);
    }
}
