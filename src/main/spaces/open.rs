// Opening windows, and where each Browser goes: one the app makes for a
// window's space, and one Chromium opens, which goes back where it was if
// it was restored, or else gets a window of its own.

use std::rc::Rc;

use wren::{Browser, MainThread, ProfileKind, RequestedBounds};

use crate::app::State;
use crate::db::SpaceId;
use crate::ipc::{self, WindowRef};
use crate::pages::UI;
use crate::tabs::placeholder;
use crate::window::{BrowserWindow, PageWindow, WindowId};

impl State {
    /// Opens a window on `space`, with no Browser yet; with no space, the
    /// window waits for its first Browser to give it one (`place_opened`).
    /// It is kept in the database while it is open (session.rs).
    pub fn open_window(
        self: &Rc<Self>,
        mt: MainThread,
        space: Option<SpaceId>,
    ) -> Option<WindowId> {
        let key = self.new_window_key();
        self.open_keyed_window(mt, key, space, None)
    }

    /// Opens window `key`, as `open_window` does: at `frame` if it has one,
    /// else below and right of the window in use. Its page is the UI's, in a
    /// Profile of its own.
    pub(super) fn open_keyed_window(
        self: &Rc<Self>,
        mt: MainThread,
        key: String,
        space: Option<SpaceId>,
        frame: Option<RequestedBounds>,
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
            } else {
                // Where it is now, should the app not quit as it should.
                state.save_frame(&window);
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
        // Where it was kept, or else below and right of the window in use, so
        // a new one does not hide it.
        match frame {
            Some(frame) => page.restore_frame(frame),
            None => {
                if let Some(front) = self.windows.front() {
                    page.cascade_from(&front.page);
                }
            }
        }
        let framed = frame.is_some();
        self.windows
            .add(BrowserWindow::new(id, key, page, space, framed));
        Some(id)
    }

    /// Opens a window on `space`, with a Browser that has no tab yet: New
    /// Window.
    pub fn open_window_on(self: &Rc<Self>, mt: MainThread, space: SpaceId) {
        let Some(id) = self.open_window(mt, Some(space)) else {
            return eprintln!("Wren opened no window.");
        };
        self.touch_space(space);
        self.open_space_browser(mt, id, space, || {});
    }

    /// Opens a window on the space used last, of any profile: the Dock icon,
    /// or New Window, with no window open.
    pub fn open_recent_window(self: &Rc<Self>, mt: MainThread) {
        match self.db.most_recent_space() {
            Ok(Some(space)) => self.open_window_on(mt, space.id),
            Ok(None) => eprintln!("Wren found no space to open."),
            Err(error) => eprintln!("Wren could not read the spaces: {error}"),
        }
    }

    /// Makes window `id` a Browser for `space`, with no tab yet but its
    /// placeholder (tabs/placeholder.rs), unless it has one or one is on the
    /// way; `then` runs once it is shown. A space whose Browser could not be
    /// made stays without one.
    pub fn open_space_browser(
        self: &Rc<Self>,
        mt: MainThread,
        id: WindowId,
        space: SpaceId,
        then: impl FnOnce() + 'static,
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
        mt.open_profile(Some(&profile), move |result| {
            let profile = match result {
                Ok(profile) => profile,
                Err(error) => return state.failed_browser(id, space, &error),
            };
            placeholder::create_browser(&profile, move |result| {
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
                state.host(&window, space, &browser);
                then();
            });
        });
    }

    fn failed_browser(&self, id: WindowId, space: SpaceId, error: &wren::Error) {
        eprintln!("Wren opened no Browser: {error:?}");
        if let Some(window) = self.windows.get(id) {
            window.forget(space);
        }
    }

    /// Shows a Browser Chromium opened: a restored one back where it was
    /// (`place_tagged`), and any other (a link opened in a new window) in a
    /// window of its own, on the space it came from: its opener's, or else
    /// that of the window in front, as New Window's, if either is of its
    /// profile; otherwise its profile's most recently used space. At
    /// startup, it goes in the window that waits for its first. Chromium
    /// names no opener for a link opened in a new window.
    pub fn place_opened(
        self: &Rc<Self>,
        mt: MainThread,
        browser: Browser,
        opener: Option<Browser>,
    ) {
        let Some(profile) = browser
            .profile()
            .filter(|profile| profile.kind() != ProfileKind::OffTheRecord)
        else {
            let _ = browser.close();
            return;
        };
        if self.place_tagged(&browser, &profile) {
            return;
        }
        if self.is_left_by_closed_window(&browser) {
            let _ = browser.close();
            return;
        }
        let of_profile = |space: &SpaceId| self.is_space_of(*space, &profile);
        let space = opener
            .and_then(|opener| self.windows.of(&opener)?.space_of(&opener))
            .filter(of_profile)
            .or_else(|| self.windows.front()?.space().filter(of_profile))
            .or_else(|| self.recent_space(mt, &profile));
        let Some(space) = space else {
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
        placeholder::adopt(&browser);
        self.host(&window, space, &browser);
        self.touch_space(space);
    }

    /// Shows `browser` as `window`'s for `space`, in front if that is its
    /// current space, and keeps the window as it is now.
    pub(super) fn host(&self, window: &BrowserWindow, space: SpaceId, browser: &Browser) {
        window.add(space, browser.clone());
        if window.is_front(browser) {
            ipc::send_browser(window, browser);
        }
        self.save_window(window);
    }
}
