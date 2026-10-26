// Switching a window between its spaces: as the user asks, as Chromium asks
// for a Browser in the background, and as a space it is on is deleted; and
// a window on a profile going with the profile. A window of spaces can also
// leave its space for none, while the user makes one, and come back.

use std::rc::Rc;

use wren::{Browser, MainThread};

use crate::app::State;
use crate::db::SpaceId;
use crate::ipc;
use crate::shell::{BrowserWindow, Place, WindowId};

impl State {
    /// Brings `space` forward in window `id`: its Browser if the window has
    /// one, or else the space empty, until a tab is opened in it.
    pub fn show_space(&self, id: WindowId, space: SpaceId) -> Result<(), String> {
        let window = self.windows.get(id).ok_or("The window is closing.")?;
        if window.is_profile_window() {
            return Err("A profile window shows no spaces.".into());
        }
        if self.db.space(space)?.is_none() {
            return Err("That space is gone.".into());
        }
        if window.space() == Some(space) {
            return Ok(());
        }
        leave_front(&window);
        let front = window.switch_to(space);
        self.save_window(&window);
        self.touch_space(space);
        match front {
            Some(browser) => {
                ipc::send_browser(&window, &browser);
                if let Some(tab) = browser.active_tab() {
                    let _ = tab.focus();
                }
            }
            None => ipc::send_no_browser(&window),
        }
        self.update_title(&window);
        Ok(())
    }

    /// Puts window `id` on no space, for the user to make one; the space it
    /// was on waits, with its Browser, until the window comes back.
    pub fn new_space(&self, id: WindowId) -> Result<(), String> {
        let window = self.windows.get(id).ok_or("The window is closing.")?;
        if window.space().is_none() {
            return Err("Only a window on a space can make one.".into());
        }
        leave_front(&window);
        window.leave_for_new_space();
        self.save_window(&window);
        ipc::send_no_browser(&window);
        self.update_title(&window);
        Ok(())
    }

    /// Brings window `id` back from no space to the space it left, or if
    /// that is gone, to the space used last. A window on a space stays.
    pub fn cancel_new_space(&self, id: WindowId) -> Result<(), String> {
        let window = self.windows.get(id).ok_or("The window is closing.")?;
        let Some(left) = window.left_space() else {
            return Ok(());
        };
        let space = match self.db.space(left)? {
            Some(_) => left,
            None => self.space_left(None)?,
        };
        self.show_space(id, space)
    }

    /// Chromium asked for `browser`, in the background, to come forward (a
    /// notification clicked, an extension): its window switches to its
    /// space, if it is a space's, and comes to the front. While a page has
    /// the window in full screen, it waits until the page is done
    /// (`wanting_foreground`).
    pub fn bring_forward(&self, browser: &Browser) {
        let Some(window) = self.windows.of(browser) else {
            return;
        };
        let Some(place) = window.place_of(browser) else {
            return;
        };
        let in_full_screen = window
            .browser()
            .is_some_and(|front| front.fullscreen_tab().is_some());
        if in_full_screen {
            return;
        }
        // A window on a profile has only the one Browser, in front already.
        if let Some(space) = place.space()
            && let Err(error) = self.show_space(window.id, space)
        {
            eprintln!("Wren could not switch spaces: {error}");
        }
        window.page.bring_forward();
    }

    /// Spaces were deleted, one alone or a profile's with it: each window
    /// on one switches to the most recently used space left, of `profile`
    /// if given (the deleted space's), and its Browsers of those spaces
    /// close with their tabs.
    pub fn leave_gone_spaces(&self, profile: Option<&str>) {
        let exists = |space| matches!(self.db.space(space), Ok(Some(_)));
        for window in self.windows.all() {
            if window.space().is_some_and(|current| !exists(current)) {
                let shown = self
                    .space_left(profile)
                    .and_then(|next| self.show_space(window.id, next));
                if let Err(error) = shown {
                    eprintln!("Wren could not leave a deleted space: {error}");
                }
            }
            let gone = window
                .kept_spaces()
                .into_iter()
                .filter(|space| !exists(*space));
            for space in gone {
                if let Some(browser) = window.forget(&Place::Space(space)) {
                    let _ = browser.close();
                }
            }
            self.save_window(&window);
        }
    }

    /// Profiles were deleted: each window on one goes. Chromium closes their
    /// Browsers itself, which leaves the windows. A list that is empty is
    /// not loaded yet, as Chromium always has a profile.
    pub fn leave_gone_profiles(self: &Rc<Self>, mt: MainThread) {
        let listed = mt.profile_list();
        if listed.is_empty() {
            return;
        }
        for window in self.windows.all() {
            let place = window.place();
            let gone = place
                .as_ref()
                .and_then(Place::profile)
                .is_some_and(|id| !listed.iter().any(|profile| profile.id == id));
            if gone {
                self.close_window(mt, window.id);
            }
        }
    }

    // The space to go to from a deleted one: `profile`'s most recently
    // used, or with none, the most recently used of all.
    fn space_left(&self, profile: Option<&str>) -> Result<SpaceId, String> {
        let of_profile = match profile {
            Some(profile) => self.db.recent_space(profile)?,
            None => None,
        };
        let next = match of_profile {
            Some(space) => Some(space),
            None => self.db.most_recent_space()?,
        };
        next.map(|space| space.id)
            .ok_or_else(|| "No space is left.".into())
    }
}

// The Browser in front is about to leave it: full screen for a page is that
// Browser's, as is the omnibox's query, and the page closes its omnibox as
// the window switches.
fn leave_front(window: &BrowserWindow) {
    if window.wants_full_screen_for_page(false) {
        window.page.set_full_screen(false);
    }
    ipc::stop_omnibox(window);
}
