// Opening windows, and where each Browser goes: one the app makes for a
// window's place, and one Chromium opens, which goes back where it was if
// it was restored, or else gets a window of its own.

use std::rc::Rc;

use wren::{Browser, MainThread, ProfileKind, RequestedBounds};

use super::popup::POPUP_MIN_SIZE;
use super::session::unkept_window_key;
use crate::analytics::Event;
use crate::app::State;
use crate::db::SpaceId;
use crate::ipc::{self, WindowRef};
use crate::pages::UI;
use crate::platform::{PageWindow, TitleBarKind};
use crate::shell::{BrowserWindow, Place, Popup, WindowId};
use crate::tabs::placeholder;

/// A browser window's size when nothing gives it one.
const WINDOW_SIZE: (f64, f64) = (1280.0, 800.0);

/// A browser window's minimum: the docked sidebar at its widest
/// (`SIDEBAR_WIDTH` in the renderer) leaves a page as wide as a phone's.
const WINDOW_MIN_SIZE: (f64, f64) = (800.0, 500.0);

impl State {
    /// Opens a window on `place`, with no Browser yet; with no place, the
    /// window waits for its first Browser to give it one (`place_opened`).
    /// It is kept in the database while it is open (session.rs), unless it
    /// is off the record.
    pub fn open_window(self: &Rc<Self>, mt: MainThread, place: Option<Place>) -> Option<WindowId> {
        let key = match place.as_ref().is_some_and(Place::is_off_the_record) {
            true => unkept_window_key(),
            false => self.new_window_key(),
        };
        self.open_keyed_window(mt, key, place, None)
    }

    /// Opens window `key` on `place`, as `open_window` does: at `frame` if
    /// it has one, else below and right of the window in use, so a new one
    /// does not hide it.
    pub(super) fn open_keyed_window(
        self: &Rc<Self>,
        mt: MainThread,
        key: String,
        place: Option<Place>,
        frame: Option<RequestedBounds>,
    ) -> Option<WindowId> {
        let front = self.windows.front();
        let window = self.open_page_window(mt, key, place, frame.is_some(), None)?;
        match (frame, front) {
            (Some(frame), _) => window.page.restore_frame(frame),
            (None, Some(front)) => window.page.cascade_from(&front.page),
            (None, None) => {}
        }
        Some(window.id)
    }

    /// Opens a browser window, `key` on `place`, where AppKit puts it: a
    /// popup's (popup.rs), drawn under the system's title bar, or else one
    /// whose page draws its own. Its page is the UI's, in a Profile of its
    /// own. `framed`: the caller places the window, and its first Browser's
    /// frame does not move it (`BrowserWindow::add`).
    pub(super) fn open_page_window(
        self: &Rc<Self>,
        mt: MainThread,
        key: String,
        place: Option<Place>,
        framed: bool,
        popup: Option<Popup>,
    ) -> Option<Rc<BrowserWindow>> {
        let profile = self.ui_profile.borrow().clone()?;
        let id = self.windows.next_id();
        let (title_bar, min_size) = match popup {
            Some(_) => (TitleBarKind::System, POPUP_MIN_SIZE),
            None => (TitleBarKind::Page, WINDOW_MIN_SIZE),
        };
        let weak = Rc::downgrade(self);
        let should_close = move || {
            if let Some(state) = weak.upgrade() {
                state.close_window(mt, id);
            }
            // The window goes as its Browsers close (`browser_closed`).
            false
        };
        let page = PageWindow::open(
            UI.web_view(&profile)?,
            "Wren",
            WINDOW_SIZE,
            min_size,
            title_bar,
            should_close,
        );
        ipc::handle_ui(&page.web_view, &WindowRef::new(self, id), mt);
        // The page and the backdrop are drawn as in use while the window is.
        // A popup's is never the window the user browses in.
        let state = Rc::downgrade(self);
        page.watch_active(mt, move |active| {
            let Some(state) = state.upgrade() else { return };
            let Some(window) = state.windows.get(id) else {
                return;
            };
            if !active {
                // Where it is now, should the app not quit as it should.
                state.save_frame(&window);
            } else if !window.is_popup() {
                state.windows.set_active(id);
                state.update_front_menu(mt);
                // The space the user is in is the one used last.
                if let Some(space) = window.space() {
                    state.touch_space(space);
                }
            }
            window.page.set_active(active);
            ipc::send_active(&window.page, active);
        });
        let state = Rc::downgrade(self);
        page.watch_crash(move || {
            if let Some(state) = state.upgrade() {
                state.analytics.record(Event::PageCrashed);
            }
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
            }
        });
        self.windows
            .add(BrowserWindow::new(id, key, page, place, framed, popup));
        let window = self.windows.get(id)?;
        // Named for its place until a tab is in front, or should none come.
        self.update_title(&window);
        Some(window)
    }

    /// Opens a window on `place`, with a Browser that has no tab yet.
    pub fn open_window_on(self: &Rc<Self>, mt: MainThread, place: Place) {
        let Some(id) = self.open_window(mt, Some(place.clone())) else {
            return eprintln!("Wren opened no window.");
        };
        if let Some(space) = place.space() {
            self.touch_space(space);
        }
        self.open_browser(mt, id, place, || {});
    }

    /// New Window: a window of spaces, on the space of `window` if one is
    /// in front and shows spaces, else on the space used last. A window on
    /// a profile, or its off-the-record side, is opened otherwise (the
    /// Library, New Incognito Window).
    pub fn new_window(self: &Rc<Self>, mt: MainThread, window: Option<&BrowserWindow>) {
        match window.and_then(BrowserWindow::space) {
            Some(space) => self.open_window_on(mt, Place::Space(space)),
            None => self.open_recent_window(mt),
        }
    }

    /// Opens a window for profile `id`: on its most recent space, or with
    /// none, on the profile.
    pub fn open_window_for_profile(self: &Rc<Self>, mt: MainThread, id: String) {
        let place = match self.db.recent_space(&id) {
            Ok(Some(space)) => Place::Space(space.id),
            Ok(None) => Place::Profile {
                id,
                off_the_record: false,
            },
            Err(error) => return eprintln!("Wren could not read the spaces: {error}"),
        };
        self.open_window_on(mt, place);
    }

    /// New Incognito Window: on the off-the-record side of `window`'s
    /// profile, or with none in front, of the startup profile's.
    pub fn new_incognito_window(self: &Rc<Self>, mt: MainThread, window: Option<&BrowserWindow>) {
        let place = |id| Place::Profile {
            id,
            off_the_record: true,
        };
        let profile = match window.and_then(BrowserWindow::place) {
            Some(Place::Space(space)) => match self.db.space(space) {
                Ok(row) => row.map(|row| row.profile),
                Err(error) => return eprintln!("Wren could not read the spaces: {error}"),
            },
            Some(place) => place.profile().map(str::to_owned),
            None => None,
        };
        if let Some(id) = profile {
            return self.open_window_on(mt, place(id));
        }
        let state = self.clone();
        mt.open_profile(None, move |result| match result {
            Ok(profile) => state.open_window_on(mt, place(profile.id())),
            Err(error) => eprintln!("Wren opened no Profile: {error:?}"),
        });
    }

    /// Opens a window on the space used last, of any profile: the Dock icon,
    /// or New Window, with no window open.
    pub fn open_recent_window(self: &Rc<Self>, mt: MainThread) {
        match self.db.most_recent_space() {
            Ok(Some(space)) => self.open_window_on(mt, Place::Space(space.id)),
            Ok(None) => eprintln!("Wren found no space to open."),
            Err(error) => eprintln!("Wren could not read the spaces: {error}"),
        }
    }

    /// Makes window `id` a Browser for `place`, with no tab yet but its
    /// placeholder (tabs/placeholder.rs), unless it has one or one is on the
    /// way; `then` runs once it is shown. A place whose Browser could not be
    /// made stays without one.
    pub fn open_browser(
        self: &Rc<Self>,
        mt: MainThread,
        id: WindowId,
        place: Place,
        then: impl FnOnce() + 'static,
    ) {
        let Some(window) = self.windows.get(id) else {
            return;
        };
        if !window.set_opening(&place) {
            return;
        }
        let (profile, off_the_record) = match &place {
            Place::Space(space) => match self.db.space(*space) {
                Ok(Some(row)) => (row.profile, false),
                Ok(None) => {
                    window.forget(&place);
                    return eprintln!("Wren opened no Browser: the space is gone.");
                }
                Err(error) => {
                    window.forget(&place);
                    return eprintln!("Wren opened no Browser: {error}");
                }
            },
            Place::Profile { id, off_the_record } => (id.clone(), *off_the_record),
        };
        let state = self.clone();
        mt.open_profile(Some(&profile), move |result| {
            let result = match off_the_record {
                true => result.and_then(|profile| profile.off_the_record()),
                false => result,
            };
            let profile = match result {
                Ok(profile) => profile,
                Err(error) => return state.failed_browser(id, &place, &error),
            };
            placeholder::create_browser(&profile, move |result| {
                let browser = match result {
                    Ok(browser) => browser,
                    Err(error) => return state.failed_browser(id, &place, &error),
                };
                // A window closed in the meantime takes no Browser, nor a
                // space's that was deleted.
                let window = state.windows.get(id);
                let Some(window) = window.filter(|w| !w.is_closing() && w.is_opening(&place))
                else {
                    let _ = browser.close();
                    return;
                };
                state.host(&window, place, &browser);
                then();
            });
        });
    }

    fn failed_browser(&self, id: WindowId, place: &Place, error: &wren::Error) {
        eprintln!("Wren opened no Browser: {error:?}");
        if let Some(window) = self.windows.get(id) {
            window.forget(place);
        }
    }

    /// Shows a Browser Chromium opened: a restored one back where it was
    /// (`place_tagged`), and any other (a link opened in a new window) in a
    /// window of its own, on the space it came from: its opener's, or else
    /// that of the window in front, as New Window's, if either is of its
    /// profile; otherwise its profile's most recently used space. A profile
    /// with no space gets a window on the profile. At startup, it goes in
    /// the window that waits for its first. Chromium names no opener for a
    /// link opened in a new window. An off-the-record one gets an
    /// off-the-record window of its own.
    pub fn place_opened(
        self: &Rc<Self>,
        mt: MainThread,
        browser: Browser,
        opener: Option<Browser>,
    ) {
        let Some(profile) = browser.profile() else {
            let _ = browser.close();
            return;
        };
        if profile.kind() == ProfileKind::OffTheRecord {
            self.host_opened(mt, &browser, Place::of_profile(&profile), None);
            return;
        }
        if self.place_tagged(&browser, &profile) {
            return;
        }
        if self.is_left_by_closed_window(&browser) {
            let _ = browser.close();
            return;
        }
        let of_profile = |space: &SpaceId| self.is_space_of(*space, &profile);
        let space = opener
            .and_then(|opener| self.windows.of(&opener)?.space_opened_from(&opener))
            .filter(of_profile)
            .or_else(|| self.windows.front()?.space().filter(of_profile))
            .or_else(|| self.recent_space(mt, &profile));
        let place = space.map_or_else(|| Place::of_profile(&profile), Place::Space);
        placeholder::adopt(&browser);
        if self.host_opened(mt, &browser, place, self.windows.waiting())
            && let Some(space) = space
        {
            self.touch_space(space);
        }
    }

    // Shows a Browser Chromium opened on `place`, in `window`, or else in a
    // window of its own. One that gets no window closes. Whether it got one.
    fn host_opened(
        self: &Rc<Self>,
        mt: MainThread,
        browser: &Browser,
        place: Place,
        window: Option<Rc<BrowserWindow>>,
    ) -> bool {
        let window = window.or_else(|| {
            let id = self.open_window(mt, Some(place.clone()))?;
            self.windows.get(id)
        });
        let Some(window) = window else {
            let _ = browser.close();
            return false;
        };
        self.host(&window, place, browser);
        true
    }

    /// Shows `browser` as `window`'s for `place`, in front if that is its
    /// current place, and keeps the window as it is now.
    pub(super) fn host(&self, window: &BrowserWindow, place: Place, browser: &Browser) {
        window.add(place, browser.clone());
        if window.is_front(browser) {
            ipc::send_browser(window, browser);
            self.update_title(window);
        }
        self.save_window(window);
    }
}
