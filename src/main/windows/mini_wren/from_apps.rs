// The Mini Wren that Wren opens itself, with no page to open it: one for
// each link from another app (open_urls.rs), and an empty one from New
// Mini Wren, whose key works in any app, on the New Tab page, where it is
// the omnibox alone (mod.rs). Each is in front and centred on the pointer,
// where the user is looking. It opens from the space of the window the user
// browses in, or else the space used last, so it never adds to a space's
// tabs unless the user opens it as a tab.
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

use std::rc::Rc;

use wren::{MainThread, RequestedBounds};

use super::{MiniWrenPosition, PAGE_SIZE, TOOLBAR};
use crate::app::State;
use crate::menus;
use crate::platform::{self, GlobalShortcut, RunningApp};
use crate::shell::{BrowserWindow, Place, WindowId};

/// Chromium's New Tab page, where an empty Mini Wren opens.
const NEW_TAB_PAGE: &str = "chrome://newtab/";

/// A Mini Wren asked for, until the app can open it.
pub(crate) struct HeldMiniWren {
    pub url: String,
    /// The app it goes back to as it closes.
    pub return_to: Option<RunningApp>,
}

impl State {
    /// Takes New Mini Wren's key from every app, so that it opens one
    /// wherever the user is. A performance run leaves the key to the user's
    /// own Wren.
    pub(crate) fn take_mini_wren_key(self: &Rc<Self>, mt: MainThread) {
        if self.perf.is_some() {
            return;
        }
        let state = Rc::downgrade(self);
        let shortcut = GlobalShortcut::new(&menus::mini_wren_key(), move || {
            if let Some(state) = state.upgrade() {
                state.new_mini_wren(mt);
            }
        });
        if shortcut.is_none() {
            eprintln!("Wren could not take New Mini Wren's key from other apps.");
        }
        *self.mini_wren_shortcut.borrow_mut() = shortcut;
    }

    /// Opens an empty Mini Wren, on the New Tab page, now or once the app
    /// can, which goes back to the app in front as it closes, if that is
    /// not Wren.
    pub fn new_mini_wren(self: &Rc<Self>, mt: MainThread) {
        let held = HeldMiniWren {
            url: NEW_TAB_PAGE.to_owned(),
            return_to: platform::frontmost_other_app(),
        };
        self.hold_mini_wren(mt, [held]);
    }

    /// Opens a Mini Wren for each of `held`, now or once the app can.
    pub(in crate::windows) fn hold_mini_wren(
        self: &Rc<Self>,
        mt: MainThread,
        held: impl IntoIterator<Item = HeldMiniWren>,
    ) {
        self.held_mini_wren.borrow_mut().extend(held);
        self.open_held(mt);
    }

    /// Opens each Mini Wren held.
    pub(in crate::windows) fn open_held_mini_wren(self: &Rc<Self>, mt: MainThread) {
        if self.held_mini_wren.borrow().is_empty() {
            return;
        }
        let Some(place) = self.mini_wren_place() else {
            return;
        };
        // Each comes in front of the last, so the first is in front.
        for held in self.held_mini_wren.take().into_iter().rev() {
            self.open_mini_wren(mt, held, place.clone());
        }
    }

    // Where a Mini Wren opens: the place of the window the user browses in,
    // or the space used last. None if there is no space, or the spaces could
    // not be read.
    fn mini_wren_place(&self) -> Option<Place> {
        if let Some(place) = self.browsing_window().and_then(|window| window.place()) {
            return Some(place);
        }
        match self.db.most_recent_space() {
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
    fn open_mini_wren(self: &Rc<Self>, mt: MainThread, held: HeldMiniWren, place: Place) {
        let HeldMiniWren { url, return_to } = held;
        let state = self.clone();
        let space = place.space();
        self.open_profile_of(mt, place, move |profile| {
            let profile = match profile {
                Ok(profile) => profile,
                Err(error) => return eprintln!("Wren could not open a Mini Wren: {error}"),
            };
            // No page asks for a size, so it gets the one the user last
            // gave.
            let (width, height) = state.kept_page_size();
            let size = RequestedBounds {
                origin: None,
                width,
                height,
            };
            profile.create_popup_browser(&url, Some(size), move |browser| match browser {
                Ok(browser) => {
                    let position = MiniWrenPosition::AtPointer;
                    let Some(window) = state.show_mini_wren(mt, browser, space, position) else {
                        return;
                    };
                    state.keep_page_size(window);
                    if let Some(app) = return_to {
                        state.returns_to.borrow_mut().insert(window, app);
                    }
                }
                Err(error) => eprintln!("Wren could not open a Mini Wren: {error:?}"),
            });
        });
    }

    // The size of the page the user last gave a Mini Wren that Wren opened,
    // or else a Mini Wren's own.
    fn kept_page_size(&self) -> (f64, f64) {
        match self.db.mini_wren_page_size() {
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
    fn keep_page_size(self: &Rc<Self>, id: WindowId) {
        let Some(window) = self.windows.get(id) else {
            return;
        };
        let state = Rc::downgrade(self);
        window.page.watch_resized(move || {
            let Some(state) = state.upgrade() else { return };
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
    pub(in crate::windows) fn window_used(&self, id: WindowId) {
        self.returns_to
            .borrow_mut()
            .retain(|window, _| *window == id);
    }

    /// Mini Wren `id`'s page moved to a tab, where it goes on: its window
    /// closes without going back to its app.
    pub(super) fn mini_wren_moved_to_tab(&self, id: WindowId) {
        self.returns_to.borrow_mut().remove(&id);
    }

    /// Mini Wren `window` is closing: if it keeps an app, and it is still
    /// the window in use, that app comes back to the front.
    pub fn mini_wren_closed(&self, window: &BrowserWindow) {
        let app = self.returns_to.borrow_mut().remove(&window.id);
        if let Some(app) = app.filter(|_| window.page.is_active())
            && !platform::activate_app(&app.id)
        {
            eprintln!("Wren could not go back to {}.", app.name);
        }
    }
}
