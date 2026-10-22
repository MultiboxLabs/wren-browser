// The spaces windows show: the Browser a window has for each, which is in
// front, and where a new Browser goes. A window has at most one Browser for
// each space it has been on, and may have none; a Browser Chromium opens
// gets a window of its own, on its profile's most recently used space.

use std::rc::Rc;

use wren::{Browser, MainThread, Profile, ProfileKind};

use crate::app::State;
use crate::db::SpaceId;
use crate::ipc::{self, WindowRef};
use crate::pages::UI;
use crate::window::{BrowserWindow, PageWindow, WindowId};

impl State {
    /// Opens a window on `space`, with no Browser yet; with no space, the
    /// window waits for its first Browser to give it one (`place_opened`).
    /// Its page is the UI's, in a Profile of its own.
    pub fn open_window(
        self: &Rc<Self>,
        mt: MainThread,
        space: Option<SpaceId>,
    ) -> Option<WindowId> {
        let profile = self.ui_profile.borrow().clone()?;
        let id = self.windows.next_id();
        let weak = Rc::downgrade(self);
        let page = PageWindow::open(&profile, &UI, "Wren", (1280.0, 800.0), move || {
            if let Some(state) = weak.upgrade() {
                state.close_window(mt, id);
            }
            // The window goes as its Browsers close (`browser_closed`).
            false
        })?;
        ipc::handle_ui(&page.web_view, &WindowRef::new(self, id), mt);
        // The page and the backdrop are drawn as in use while the window is.
        let state = Rc::downgrade(self);
        page.watch_active(mt, move |active| {
            let Some(state) = state.upgrade() else { return };
            let Some(window) = state.windows.get(id) else {
                return;
            };
            if active {
                state.windows.set_active(id);
                // The space the user is in is the one used last.
                if let Some(space) = window.space() {
                    state.touch_space(space);
                }
            }
            window.page.set_active(active);
            ipc::send_active(&window.page, active);
        });
        let state = Rc::downgrade(self);
        page.watch_full_screen(move |full_screen| {
            let Some(state) = state.upgrade() else { return };
            if let Some(window) = state.windows.get(id) {
                ipc::send_full_screen(&window.page, full_screen);
            }
        });
        let state = Rc::downgrade(self);
        page.watch_full_screen_finished(move |full_screen| {
            let Some(state) = state.upgrade() else { return };
            if let Some(window) = state.windows.get(id) {
                window.full_screen_finished(full_screen);
                // A Browser that asked to come forward meanwhile does now.
                if !full_screen && let Some(browser) = window.wanting_foreground() {
                    state.bring_forward(&browser);
                }
            }
        });
        // Below and right of the window in use, so a new one does not hide it.
        if let Some(front) = self.windows.front() {
            page.cascade_from(&front.page);
        }
        self.windows.add(BrowserWindow::new(id, page, space));
        Some(id)
    }

    /// Opens a window on `space`, with a Browser on the New Tab page: New
    /// Window.
    pub fn open_window_on(self: &Rc<Self>, mt: MainThread, space: SpaceId) {
        let Some(id) = self.open_window(mt, Some(space)) else {
            return eprintln!("Wren opened no window.");
        };
        self.touch_space(space);
        self.open_space_browser(mt, id, space, "", |_, _| {});
    }

    /// Makes window `id` a Browser for `space` on `url` ("" for the New Tab
    /// page), unless it has one or one is on the way; `then` runs once it is
    /// shown. A space whose Browser could not be made stays without one.
    pub fn open_space_browser(
        self: &Rc<Self>,
        mt: MainThread,
        id: WindowId,
        space: SpaceId,
        url: &str,
        then: impl FnOnce(&BrowserWindow, &Browser) + 'static,
    ) {
        let Some(window) = self.windows.get(id) else {
            return;
        };
        if !window.set_opening(space) {
            return;
        }
        let profile = match self.db.space(space) {
            Ok(Some(row)) => row.profile,
            Ok(None) => {
                window.forget(space);
                return eprintln!("Wren opened no Browser: the space is gone.");
            }
            Err(error) => {
                window.forget(space);
                return eprintln!("Wren opened no Browser: {error}");
            }
        };
        let state = self.clone();
        let url = url.to_owned();
        mt.open_profile(Some(&profile), move |result| {
            let profile = match result {
                Ok(profile) => profile,
                Err(error) => return state.failed_browser(id, space, &error),
            };
            profile.create_browser(&url, move |result| {
                let browser = match result {
                    Ok(browser) => browser,
                    Err(error) => return state.failed_browser(id, space, &error),
                };
                // A window closed in the meantime takes no Browser, nor one
                // whose space was deleted.
                let window = state.windows.get(id);
                let Some(window) = window.filter(|w| !w.is_closing() && w.is_opening(space)) else {
                    let _ = browser.close();
                    return;
                };
                window.add(space, browser.clone());
                if window.is_front(&browser) {
                    ipc::send_browser(&window, &browser);
                }
                then(&window, &browser);
            });
        });
    }

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
        // A Browser made for the omnibox, which opened nothing, goes with it.
        window.close_if_unused();
        // Full screen for a page is the old Browser's.
        if window.wants_full_screen_for_page(false) {
            window.page.set_full_screen(false);
        }
        let front = window.switch_to(space);
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

    /// `space`, of `profile`, was deleted: each window on it switches to the
    /// profile's most recent space, and its Browser closes with its tabs.
    pub fn space_deleted(&self, space: SpaceId, profile: &str) {
        for window in self.windows.showing(space) {
            if window.space() == Some(space) {
                let next = self.db.recent_space(profile);
                let shown = match next {
                    Ok(Some(next)) => self.show_space(window.id, next.id),
                    Ok(None) => Err("The profile has no space left.".into()),
                    Err(error) => Err(error),
                };
                if let Err(error) = shown {
                    eprintln!("Wren could not leave a deleted space: {error}");
                }
            }
            if let Some(browser) = window.forget(space) {
                let _ = browser.close();
            }
        }
    }

    fn failed_browser(&self, id: WindowId, space: SpaceId, error: &wren::Error) {
        eprintln!("Wren opened no Browser: {error:?}");
        if let Some(window) = self.windows.get(id) {
            window.forget(space);
        }
    }

    /// Shows a Browser Chromium opened (a restored window, a page's new
    /// window) in a window of its own, on its profile's most recently used
    /// space; or, at startup, in the window that waits for its first.
    pub fn place_opened(self: &Rc<Self>, mt: MainThread, browser: Browser) {
        let Some(profile) = browser
            .profile()
            .filter(|profile| profile.kind() != ProfileKind::OffTheRecord)
        else {
            let _ = browser.close();
            return;
        };
        let Some(space) = self.recent_space(mt, &profile) else {
            eprintln!("Wren found no space for a Browser.");
            let _ = browser.close();
            return;
        };
        let window = self.windows.waiting().or_else(|| {
            let id = self.open_window(mt, Some(space))?;
            self.windows.get(id)
        });
        let Some(window) = window else {
            let _ = browser.close();
            return;
        };
        window.add(space, browser.clone());
        if window.is_front(&browser) {
            ipc::send_browser(&window, &browser);
        }
        self.touch_space(space);
    }

    /// Restores `profile`'s last session, whose windows arrive in
    /// `place_opened`; with nothing restored, the window that waits for a
    /// Browser opens on the profile's most recent space, on the New Tab page.
    pub fn restore(self: &Rc<Self>, mt: MainThread, profile: Profile) {
        let state = self.clone();
        profile.clone().restore_last_session(move |result| {
            if let Err(error) = result {
                eprintln!("Wren restored no session: {error:?}");
            }
            let Some(window) = state.windows.waiting() else {
                return;
            };
            let Some(space) = state.recent_space(mt, &profile) else {
                return eprintln!("Wren found no space to open.");
            };
            window.switch_to(space);
            ipc::send_space(&window);
            state.touch_space(space);
            state.open_space_browser(mt, window.id, space, "", |_, _| {});
        });
    }

    // The profile's most recently used space. A profile Chromium has just
    // made may have none yet: it is given its first.
    fn recent_space(&self, mt: MainThread, profile: &Profile) -> Option<SpaceId> {
        let id = profile.id();
        let recent = || match self.db.recent_space(&id) {
            Ok(space) => space.map(|space| space.id),
            Err(error) => {
                eprintln!("Wren could not read the spaces: {error}");
                None
            }
        };
        recent().or_else(|| {
            let fill = self.creating_profiles.get() == 0;
            if self.db.sync_profiles(&mt.profile_list(), fill) {
                ipc::broadcast_spaces(self);
            }
            recent()
        })
    }

    /// Notes that `space` is in use now.
    pub fn touch_space(&self, space: SpaceId) {
        if let Err(error) = self.db.touch_space(space) {
            eprintln!("Wren could not note a space's use: {error}");
        }
    }
}
