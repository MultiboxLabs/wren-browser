// Switching a window between its spaces: as the user asks, as Chromium asks
// for a Browser in the background, and as a space it is on is deleted.

use wren::Browser;

use crate::app::State;
use crate::db::SpaceId;
use crate::ipc;
use crate::window::WindowId;

impl State {
    /// Brings `space` forward in window `id`: its Browser if the window has
    /// one, or else the space empty, until a tab is opened in it.
    pub fn show_space(&self, id: WindowId, space: SpaceId) -> Result<(), String> {
        let window = self.windows.get(id).ok_or("The window is closing.")?;
        if self.db.space(space)?.is_none() {
            return Err("That space is gone.".into());
        }
        if window.space() == Some(space) {
            return Ok(());
        }
        // Full screen for a page is the old Browser's.
        if window.wants_full_screen_for_page(false) {
            window.page.set_full_screen(false);
        }
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
        Ok(())
    }

    /// Chromium asked for `browser`, in the background, to come forward (a
    /// notification clicked, an extension): its window switches to its
    /// space, and comes to the front. While a page has the window in full
    /// screen, it waits until the page is done (`wanting_foreground`).
    pub fn bring_forward(&self, browser: &Browser) {
        let Some(window) = self.windows.of(browser) else {
            return;
        };
        let Some(space) = window.space_of(browser) else {
            return;
        };
        let in_full_screen = window
            .browser()
            .is_some_and(|front| front.fullscreen_tab().is_some());
        if in_full_screen {
            return;
        }
        if let Err(error) = self.show_space(window.id, space) {
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
                if let Some(browser) = window.forget(space) {
                    let _ = browser.close();
                }
            }
            self.save_window(&window);
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
