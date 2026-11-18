// Opening windows, and where each Browser goes: one the app makes for a
// window's place, and one Chromium opens, which goes back where it was if
// it was restored, or else gets a window of its own.

use std::cell::Cell;
use std::rc::Rc;

use wren::{Browser, MainThread, Profile, ProfileKind, RequestedBounds};

use super::mini_wren::MINI_WREN_MIN_SIZE;
use super::session::unkept_window_key;
use crate::analytics::Event;
use crate::app::State;
use crate::db::SpaceId;
use crate::ipc::{self, WindowRef};
use crate::pages::UI;
use crate::perf::PageCounts;
use crate::platform::{PageWindow, WindowKind, WindowSize};
use crate::shell::{BrowserWindow, MiniWren, Place, WindowId};
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

    /// Analytics hears of it if the UI's page in `page` crashes.
    pub(crate) fn count_crashes(self: &Rc<Self>, page: &PageWindow) {
        let state = Rc::downgrade(self);
        page.watch_crash(move || {
            if let Some(state) = state.upgrade() {
                state.analytics.record(Event::PageCrashed);
            }
        });
    }

    /// Opens a browser window, `key` on `place`, where AppKit puts it: a
    /// Mini Wren (mini_wren/), a panel that never brings the app forward,
    /// or else one the user browses in. Its page is the UI's, in a Profile
    /// of its own. `framed`: the caller places the window, and its first
    /// Browser's frame does not move it (`BrowserWindow::add`).
    pub(super) fn open_page_window(
        self: &Rc<Self>,
        mt: MainThread,
        key: String,
        place: Option<Place>,
        framed: bool,
        mini_wren: Option<MiniWren>,
    ) -> Option<Rc<BrowserWindow>> {
        let profile = self.ui_profile.borrow().clone()?;
        let id = self.windows.next_id();
        let (min_size, kind) = match mini_wren {
            Some(_) => (MINI_WREN_MIN_SIZE, WindowKind::Panel),
            None => (WINDOW_MIN_SIZE, WindowKind::Window),
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
            WindowSize::Resizable {
                size: WINDOW_SIZE,
                min: min_size,
            },
            kind,
            should_close,
        );
        ipc::handle_ui(&page.web_view, &WindowRef::new(self, id), mt);
        // The page and the backdrop are drawn as in use while the window is.
        // A Mini Wren is never the window the user browses in. Going out of
        // use counts once the window has been in use: as it first shows, the
        // app may not have come forward yet.
        let state = Rc::downgrade(self);
        let in_use = Cell::new(false);
        page.watch_active(mt, move |active| {
            let Some(state) = state.upgrade() else { return };
            let Some(window) = state.windows.get(id) else {
                return;
            };
            if !active {
                // Where it is now, should the app not quit as it should.
                state.save_frame(&window);
                if in_use.replace(false) {
                    state.window_left(mt, &window);
                }
            } else {
                in_use.set(true);
                state.window_used(id);
                if window.is_mini_wren() {
                    // A Mini Wren in use allows Open as Tab.
                    state.update_front_menu(mt);
                } else {
                    state.windows.set_active(id);
                    state.update_front_menu(mt);
                    // The space the user is in is the one used last.
                    if let Some(space) = window.space() {
                        state.touch_space(space);
                    }
                }
            }
            ipc::show_active(&window.page, active);
        });
        // Whether the pointer is over the sidebar, as it moves, and as the
        // window comes into use or goes out of it.
        let state = Rc::downgrade(self);
        page.watch_pointer(mt, move || {
            let Some(state) = state.upgrade() else { return };
            if let Some(window) = state.windows.get(id) {
                ipc::check_sidebar_hover(&window);
            }
        });
        self.count_crashes(&page);
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
        let perf_counts = self.perf.as_ref().map(|_| PageCounts::default());
        self.windows.add(BrowserWindow::new(
            id,
            key,
            page,
            place,
            framed,
            mini_wren,
            perf_counts,
        ));
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

    /// Calls `then` with window `id`'s Browser for `place`, making one first
    /// (`open_browser`) if it has none, or with why it has none: the window
    /// is closing, or the place's Browser is still on its way.
    pub fn with_browser_of(
        self: &Rc<Self>,
        mt: MainThread,
        id: WindowId,
        place: Place,
        then: impl FnOnce(Result<Browser, String>) + 'static,
    ) {
        let Some(window) = self.windows.get(id) else {
            return then(Err("The window is closing.".into()));
        };
        if let Some(browser) = window.browser_of(&place) {
            return then(Ok(browser));
        }
        if window.is_opening(&place) {
            return then(Err("That space is still opening.".into()));
        }
        let state = self.clone();
        self.open_browser(mt, id, place.clone(), move || {
            let browser = state.windows.get(id).and_then(|w| w.browser_of(&place));
            then(browser.ok_or_else(|| "The space has no Browser.".to_owned()));
        });
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
        let state = self.clone();
        self.open_profile_of(mt, place.clone(), move |result| {
            let profile = match result {
                Ok(profile) => profile,
                Err(error) => return state.failed_browser(id, &place, &error),
            };
            placeholder::create_browser(&profile, move |result| {
                let browser = match result {
                    Ok(browser) => browser,
                    Err(error) => return state.failed_browser(id, &place, &format!("{error:?}")),
                };
                // A window closed in the meantime takes no Browser, nor a
                // space's that was deleted.
                let window = state.windows.get(id);
                let Some(window) = window.filter(|w| !w.is_closing() && w.is_opening(&place))
                else {
                    browser.close(|_| {});
                    return;
                };
                state.host(&window, place, &browser);
                then();
                // Pages held for want of a Browser open now (show_page.rs).
                state.open_held(mt);
            });
        });
    }

    /// Calls `then` with the profile `place` is on, opened: a space's, by
    /// its row, or the profile's own, or its off-the-record side; or with
    /// why there is none.
    pub(super) fn open_profile_of(
        &self,
        mt: MainThread,
        place: Place,
        then: impl FnOnce(Result<Profile, String>) + 'static,
    ) {
        let (profile, off_the_record) = match place {
            Place::Space(space) => match self.db.space(space) {
                Ok(Some(row)) => (row.profile, false),
                Ok(None) => return then(Err("The space is gone.".into())),
                Err(error) => return then(Err(error)),
            },
            Place::Profile { id, off_the_record } => (id, off_the_record),
        };
        mt.open_profile(Some(&profile), move |result| {
            let result = match off_the_record {
                true => result.and_then(|profile| profile.off_the_record()),
                false => result,
            };
            then(result.map_err(|error| format!("{error:?}")));
        });
    }

    fn failed_browser(&self, id: WindowId, place: &Place, error: &str) {
        eprintln!("Wren opened no Browser: {error}");
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
    /// the window that waits for its first. Chromium names the opener of a
    /// link opened in a new window, noopener or not. An off-the-record one
    /// gets an
    /// off-the-record window of its own.
    pub fn place_opened(
        self: &Rc<Self>,
        mt: MainThread,
        browser: Browser,
        opener: Option<Browser>,
    ) {
        let Some(profile) = browser.profile() else {
            browser.close(|_| {});
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
            browser.close(|_| {});
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
            browser.close(|_| {});
            return false;
        };
        self.host_as_requested(&window, place, browser);
        true
    }

    /// Shows `browser` as `window`'s for `place`, in front if that is its
    /// current place, and keeps the window as it is now.
    pub(super) fn host(&self, window: &BrowserWindow, place: Place, browser: &Browser) {
        window.add(place, browser.clone());
        if window.is_front(browser) {
            ipc::send_browser(window, browser);
            self.update_title(window);
        } else {
            ipc::send_tabs(window, browser);
        }
        self.save_window(window);
    }

    // Shows a Browser Chromium opened or restored, as `host` does, in the
    // state Chromium wants its window in.
    pub(super) fn host_as_requested(
        &self,
        window: &BrowserWindow,
        place: Place,
        browser: &Browser,
    ) {
        self.host(window, place, browser);
        self.start_as_requested(window, browser);
    }
}
