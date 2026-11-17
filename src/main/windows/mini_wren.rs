// The Mini Wren the app opens itself, with no page to open it: one for each
// link from another app (open_urls.rs), and an empty one from New Mini Wren,
// whose key works in any app. Each is a popup's window (popup.rs), in front.
// It opens from the space of the window the user browses in, or else the
// space used last, so it never adds to a space's tabs unless the user opens
// it as a tab.
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

use std::rc::Rc;

use wren::{MainThread, RequestedBounds};

use super::popup::PAGE_SIZE;
use crate::app::State;
use crate::menus;
use crate::platform::{self, GlobalShortcut, RunningApp};
use crate::shell::{BrowserWindow, Place, WindowId};

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

    /// Opens an empty Mini Wren, now or once the app can, which goes back
    /// to the app in front as it closes, if that is not Wren.
    pub fn new_mini_wren(self: &Rc<Self>, mt: MainThread) {
        let held = HeldMiniWren {
            // Wren Runtime takes no empty address for a popup.
            url: "about:blank".to_owned(),
            return_to: platform::frontmost_other_app(),
        };
        self.hold_mini_wren(mt, [held]);
    }

    /// Opens a Mini Wren for each of `held`, now or once the app can.
    pub(super) fn hold_mini_wren(
        self: &Rc<Self>,
        mt: MainThread,
        held: impl IntoIterator<Item = HeldMiniWren>,
    ) {
        self.held_mini_wren.borrow_mut().extend(held);
        self.open_held(mt);
    }

    /// Opens each Mini Wren held.
    pub(super) fn open_held_mini_wren(self: &Rc<Self>, mt: MainThread) {
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
    // opener, from `place` if it is a space, cascaded from the window in
    // front.
    fn open_mini_wren(self: &Rc<Self>, mt: MainThread, held: HeldMiniWren, place: Place) {
        let HeldMiniWren { url, return_to } = held;
        let state = self.clone();
        let space = place.space();
        self.open_profile_of(mt, place, move |profile| {
            let profile = match profile {
                Ok(profile) => profile,
                Err(error) => return eprintln!("Wren could not open a Mini Wren: {error}"),
            };
            // No page asks for a size, so it gets a popup's own.
            let size = RequestedBounds {
                origin: None,
                width: PAGE_SIZE.0,
                height: PAGE_SIZE.1,
            };
            profile.create_popup_browser(&url, Some(size), move |browser| match browser {
                Ok(browser) => {
                    let window = state.show_popup(mt, browser, space, None);
                    if let Some((window, app)) = window.zip(return_to) {
                        state.returns_to.borrow_mut().insert(window, app);
                    }
                }
                Err(error) => eprintln!("Wren could not open a Mini Wren: {error:?}"),
            });
        });
    }

    /// Window `id` came into use: no Mini Wren but it goes back to its app
    /// as it closes.
    pub(super) fn window_used(&self, id: WindowId) {
        self.returns_to
            .borrow_mut()
            .retain(|window, _| *window == id);
    }

    /// Popup window `id`'s page moved to a tab, where it goes on: its window
    /// closes without going back to its app.
    pub(super) fn popup_moved_to_tab(&self, id: WindowId) {
        self.returns_to.borrow_mut().remove(&id);
    }

    /// Popup `window` is closing: if it is a Mini Wren that keeps an app,
    /// and it is still the window in use, that app comes back to the front.
    pub fn mini_wren_closed(&self, window: &BrowserWindow) {
        let app = self.returns_to.borrow_mut().remove(&window.id);
        if let Some(app) = app.filter(|_| window.page.is_active())
            && !platform::activate_app(&app.id)
        {
            eprintln!("Wren could not go back to {}.", app.name);
        }
    }
}
