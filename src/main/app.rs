// The app's state and Wren's callbacks.

use std::cell::{Cell, RefCell};
use std::collections::HashMap;
use std::path::PathBuf;
use std::rc::Rc;

use wren::{
    App, Browser, BrowserType, Change, ChangeKind, MainThread, PopoverAnswer, PopoverKind,
    PopoverRequest, PopoverTrigger, Profile, QuitPrompt,
};

use crate::changes;
use crate::db::Db;
use crate::ipc::{self, OmniboxTarget};
use crate::keyboard::KeyWatch;
use crate::menus;
use crate::pages::{SCHEME, Source, serve_page};
use crate::perf::Perf;
use crate::sidebar::SidebarStore;
use crate::tabs::{self, placeholder};
use crate::window::{
    BrowserWindow, PlainWindow, QUITS_WITH_LAST_WINDOW, WindowId, Windows, close_other_key_window,
};

// What the app holds, shared with the closures it hands Wren.
pub struct State {
    // The pages', not the user's.
    pub(crate) ui_profile: RefCell<Option<Profile>>,
    devtools: RefCell<HashMap<Browser, PlainWindow>>,
    pub windows: Windows,
    // What the pages keep between runs, in `data`; all windows share it.
    pub sidebar: SidebarStore,
    /// What the app keeps of its own, spaces for now.
    pub db: Db,
    /// Profiles whose last session is being restored (spaces/session.rs).
    pub(crate) restoring: Cell<u32>,
    /// The sidebar's performance run, if this is one.
    pub perf: Option<Perf>,
    /// The warning before quitting a window's page shows (ipc/quit.rs).
    pub quit_prompt: RefCell<Option<ipc::OpenQuitPrompt>>,
    /// The window whose tab switcher is open, while ⌃ is held
    /// (ipc/tab_switcher.rs).
    pub tab_switcher: Cell<Option<WindowId>>,
    /// Whether the main menu's Spaces menu is enabled, as it is not while a
    /// window on a profile is in front (spaces/mod.rs).
    pub(crate) spaces_menu_on: Cell<bool>,
    // Hears the tab switcher's keys while it is kept.
    tab_switcher_keys: RefCell<Option<KeyWatch>>,
}

impl State {
    pub fn new(data: PathBuf, perf: Option<Perf>) -> State {
        State {
            ui_profile: RefCell::default(),
            devtools: RefCell::default(),
            windows: Windows::default(),
            sidebar: SidebarStore::new(&data),
            db: Db::open(&data),
            restoring: Cell::new(0),
            perf,
            quit_prompt: RefCell::default(),
            tab_switcher: Cell::default(),
            spaces_menu_on: Cell::new(true),
            tab_switcher_keys: RefCell::default(),
        }
    }

    // Opens the windows open at the last quit, or else the first window, then
    // the user's own Profile, the one Chromium starts with, and each profile
    // they wait for, with the tabs they had (spaces/session.rs).
    fn start(self: &Rc<Self>, mt: MainThread) {
        // The database has each profile, and the app a space, before anything
        // shows them. The list is read again once the first profile is open,
        // in case it was not filled yet.
        self.db.sync_profiles(&mt.profile_list());
        if !self.open_saved_windows(mt) {
            self.open_window(mt, None);
        }
        if self.windows.len() == 0 {
            eprintln!("Wren made no web view.");
            return mt.quit();
        }
        let state = self.clone();
        mt.open_profile(None, move |result| match result {
            Ok(profile) => {
                if state.db.sync_profiles(&mt.profile_list()) {
                    ipc::broadcast_spaces(&state);
                }
                // A kept window on a profile deleted since goes.
                state.leave_gone_profiles(mt);
                state.update_menu(mt);
                state.restore_sessions(mt, profile)
            }
            Err(error) => {
                eprintln!("Wren opened no Profile: {error:?}");
                mt.quit();
            }
        });
    }

    // The close button of window `id`. Where the last window quits the app
    // (not on a Mac), it is kept with its session for the next run. Any
    // other is forgotten, and leaves by closing its Browsers, as Chrome's
    // does, and goes once they have.
    pub(crate) fn close_window(self: &Rc<Self>, mt: MainThread, id: WindowId) {
        if QUITS_WITH_LAST_WINDOW && self.windows.len() <= 1 {
            return mt.quit();
        }
        let Some(window) = self.windows.get(id) else {
            return;
        };
        ipc::quit_window_closing(self, id);
        self.forget_window(&window);
        if window.has_browsers() {
            return window.close_browsers();
        }
        // It has no Browser to close, and is not dropped inside its own
        // delegate's call.
        let state = Rc::downgrade(self);
        mt.later(move |_| {
            if let Some(state) = state.upgrade() {
                state.windows.remove(id);
            }
        });
    }

    // ⌘W: the omnibox for a new tab, as if it were that tab; else the space
    // the user makes, which the window comes back from; else the active tab;
    // or, with none of its own, the window, as Chrome's goes with its last
    // tab.
    fn close_tab(self: &Rc<Self>, mt: MainThread, window: &BrowserWindow) {
        if window.has_new_tab_omnibox() {
            return ipc::send_close_omnibox(window);
        }
        if window.left_space().is_some() {
            if let Err(error) = self.cancel_new_space(window.id) {
                eprintln!("Wren could not leave the new space: {error}");
            }
            return;
        }
        let active = window
            .browser_with_tabs()
            .and_then(|browser| Some((browser.active_tab()?, browser)));
        match active {
            Some((tab, browser)) => {
                let _ = tabs::close(&browser, &[tab]);
            }
            None => self.close_window(mt, window.id),
        }
    }
}

pub struct Wren {
    pub state: Rc<State>,
    pub source: Source,
}

impl App for Wren {
    fn ready(&self, mt: MainThread) {
        self.state.update_menu(mt);
        *self.state.tab_switcher_keys.borrow_mut() = ipc::watch_tab_switcher_keys(&self.state);
        let source = self.source.clone();
        let _ = mt.set_scheme_handler(
            SCHEME,
            Some(Box::new(move |request| serve_page(request, &source))),
        );
        // The pages get a Profile of their own, so their storage is not
        // among the user's sites'.
        let state = self.state.clone();
        mt.create_ephemeral_profile(move |result| match result {
            Ok(profile) => {
                *state.ui_profile.borrow_mut() = Some(profile);
                state.start(mt);
            }
            Err(_) => mt.quit(),
        });
    }

    // Required: Chromium opened a Browser of its own. A normal one, a
    // restored window or one a link or the omnibox asked for, is shown in a
    // window of its own, on the space it came from, or an incognito one on
    // its profile's off-the-record side (`place_opened`); other kinds (a
    // popup) close. DevTools gets a plain window of its own.
    fn browser_opened(
        &self,
        mt: MainThread,
        opened: Browser,
        kind: BrowserType,
        opener: Option<Browser>,
    ) {
        if kind == BrowserType::Devtools {
            let window = PlainWindow::new(opened.clone());
            self.state.devtools.borrow_mut().insert(opened, window);
            return;
        }
        if kind == BrowserType::Normal {
            self.state.place_opened(mt, opened, opener);
        } else {
            let _ = opened.close();
        }
    }

    fn changed(&self, mt: MainThread, changes: &[Change]) {
        let state = &self.state;
        if changes
            .iter()
            .any(|change| change.kind == ChangeKind::Profiles)
        {
            // A profile deleted elsewhere takes its spaces and windows with
            // it. One renamed is told too: the page and the main menu show
            // profiles' names.
            if state.db.sync_profiles(&mt.profile_list()) {
                state.leave_gone_spaces(None);
            }
            state.leave_gone_profiles(mt);
            ipc::broadcast_spaces(state);
        }
        // Warn Before Quitting's item is checked as the setting is, which
        // Chrome's settings page and Always Quit change too.
        if changes
            .iter()
            .any(|change| change.kind == ChangeKind::QuitWarning)
        {
            state.update_menu(mt);
        }
        for change in changes {
            let Some(browser) = &change.browser else {
                continue;
            };
            match change.kind {
                // A restore asks for the Browser Chromium had active to come
                // forward, which would take the window off the space it was
                // kept on.
                ChangeKind::ForegroundRequest if !state.is_restoring() => {
                    state.bring_forward(browser)
                }
                // A placeholder goes, or stays, as the tabs change; undocked
                // DevTools shows its active tab.
                ChangeKind::Tabs | ChangeKind::Tab => {
                    placeholder::settle(browser);
                    if let Some(window) = state.devtools.borrow().get(browser) {
                        window.show_active_tab();
                    }
                }
                _ => {}
            }
        }
        for window in self.state.windows.all() {
            if changes::apply(&window, changes) {
                state.update_title(&window);
            }
        }
    }

    // The window is the one of the Browser in the key window, or else the
    // one the user was in last.
    fn menu_command(&self, mt: MainThread, id: &str, browser: Option<Browser>) {
        let windows = &self.state.windows;
        let window = browser
            .and_then(|browser| windows.of(&browser))
            .or_else(|| windows.front());
        // Needs no window; the menu follows the change.
        if id == menus::TOGGLE_QUIT_WARNING {
            if let Err(error) = mt.set_quit_warning(!mt.quit_warning().on) {
                eprintln!("Wren could not change Warn Before Quitting: {error:?}");
            }
            return;
        }
        // A window of the system's or a plain one, such as the About
        // panel, closes as it would in any app.
        if (id == menus::CLOSE_TAB || id == menus::CLOSE_WINDOW)
            && close_other_key_window(windows.all().iter().map(|window| &window.page))
        {
            return;
        }
        // From the window in front, if one is.
        if id == menus::NEW_WINDOW {
            return self.state.new_window(mt, window.as_deref());
        }
        if id == menus::NEW_INCOGNITO_WINDOW {
            return self.state.new_incognito_window(mt, window.as_deref());
        }
        let Some(window) = window else {
            return;
        };
        // The page switches, so the sidebar slides as a press makes it. The
        // items are greyed out while a window on a profile is in front.
        if let Some(space) = id.strip_prefix(menus::SPACE).and_then(|id| id.parse().ok()) {
            return ipc::send_choose_space(&window, space);
        }
        if id == menus::CLOSE_WINDOW {
            return self.state.close_window(mt, window.id);
        }
        if id == menus::TOGGLE_SIDEBAR {
            return ipc::send_toggle_sidebar(&window);
        }
        if id == menus::NEW_TAB {
            return ipc::send_show_omnibox(&window, OmniboxTarget::NewTab, true);
        }
        if id == menus::OPEN_LOCATION {
            return ipc::send_show_omnibox(&window, OmniboxTarget::Current, true);
        }
        if id == menus::TOGGLE_UI_DEVTOOLS {
            // UI DevTools uses the UI's separate Profile, so site DevTools
            // stays open when this item is toggled.
            let opened = self
                .state
                .devtools
                .borrow()
                .keys()
                .find(|browser| browser.profile() == *self.state.ui_profile.borrow())
                .cloned();
            let result = match opened {
                Some(browser) => browser.close(),
                None => window.page.web_view.open_dev_tools(),
            };
            if let Err(error) = result {
                eprintln!("Wren could not toggle UI DevTools: {error:?}");
            }
            return;
        }
        if id == menus::CLOSE_TAB {
            return self.state.close_tab(mt, &window);
        }
        let Some(browser) = window.browser() else {
            return;
        };
        let _ = match id {
            menus::COPY_URL => tabs::copy_url(&browser),
            menus::MOVE_TAB_UP | menus::MOVE_TAB_DOWN => match browser.active_tab() {
                Some(tab) => tabs::move_by(
                    mt,
                    &browser,
                    tab,
                    if id == menus::MOVE_TAB_UP { -1 } else { 1 },
                ),
                None => Ok(()),
            },
            _ => Ok(()),
        };
    }

    // Toasts and the find bar are the page's: the toast at the window's top
    // right, Chromium's and the app's own alike, and the bar at the active
    // tab's. The page hears of one once Chromium's call is over, when the
    // request is open. The rest of Chromium's popovers are its own still.
    fn popover(&self, mt: MainThread, request: &PopoverRequest) -> PopoverAnswer {
        if !matches!(request.kind, PopoverKind::Toast | PopoverKind::Find) {
            return PopoverAnswer::Chromium;
        }
        let state = Rc::downgrade(&self.state);
        let browser = request.browser.clone();
        let kind = request.kind;
        let tab = request.tab;
        // A find the user opened takes the keyboard; one that comes back
        // with its tab does not.
        let focus = request.trigger != PopoverTrigger::Automatic;
        mt.later(move |_| {
            let Some(state) = state.upgrade() else { return };
            if let Some(window) = state.windows.of(&browser)
                && window.is_front(&browser)
            {
                match kind {
                    PopoverKind::Find => ipc::send_show_find(&window, &browser, tab, focus),
                    _ => ipc::send_toast(&window, &browser),
                }
            }
        });
        PopoverAnswer::App
    }

    // A page wants the whole window, or is done with it. The window goes full
    // screen for it once Chromium's call is over, and Chromium hears when it
    // has (BrowserWindow::full_screen_finished). A page in the background, or
    // one leaving full screen the user chose, has its way at once.
    fn fullscreen(&self, mt: MainThread, browser: Browser, fullscreen: bool) -> bool {
        let Some(window) = self
            .state
            .windows
            .of(&browser)
            .filter(|window| window.is_front(&browser))
        else {
            return false;
        };
        if !window.wants_full_screen_for_page(fullscreen) {
            return false;
        }
        let state = Rc::downgrade(&self.state);
        let id = window.id;
        mt.later(move |_| {
            let Some(state) = state.upgrade() else { return };
            if let Some(window) = state.windows.get(id) {
                window.page.set_full_screen(fullscreen);
            }
        });
        true
    }

    // ⌘Q warns in the page of the window in front, in place of Chromium's
    // "Hold ⌘Q to Quit".
    fn quit_prompt(&self, mt: MainThread, prompt: &QuitPrompt) -> PopoverAnswer {
        ipc::show_quit_prompt(&self.state, mt, prompt)
    }

    // Each window open now comes back where it is.
    fn will_quit(&self, _: MainThread) {
        for window in self.state.windows.all() {
            self.state.save_frame(&window);
        }
    }

    // The Dock icon, with no window open: a new one.
    fn reopen(&self, mt: MainThread, _: bool) {
        if self.state.windows.len() == 0 {
            self.state.open_recent_window(mt);
        }
    }

    // Chromium closes a Browser whose last tab closes. Its window stays, with
    // the space empty, unless the user is closing the window: that goes with
    // its last Browser, and the app with the last window where it quits so.
    // A window on a profile stays too: at quit, each Browser closes before
    // the app hears of the quit, and the window must be kept. One whose
    // profile was deleted goes with it (`State::leave_gone_profiles`).
    fn browser_closed(&self, mt: MainThread, browser: Browser) {
        let devtools = self.state.devtools.borrow_mut().remove(&browser);
        if devtools.is_some() {
            return;
        }
        let Some(window) = self.state.windows.of(&browser) else {
            return;
        };
        let place = window.remove(&browser);
        if window.is_closing() {
            if !window.has_browsers() {
                self.state.windows.remove(window.id);
                if QUITS_WITH_LAST_WINDOW && self.state.windows.len() == 0 {
                    mt.quit();
                }
            }
            return;
        }
        if place.is_some() && place == window.place() {
            ipc::send_no_browser(&window);
            self.state.update_title(&window);
        }
    }
}
