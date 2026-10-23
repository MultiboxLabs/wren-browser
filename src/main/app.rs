// The app's state and Wren's callbacks.

use std::cell::{Cell, RefCell};
use std::collections::HashMap;
use std::path::PathBuf;
use std::rc::Rc;

use wren::{
    App, Browser, BrowserType, Change, ChangeKind, MainThread, PopoverAnswer, PopoverKind,
    PopoverRequest, PopoverTrigger, Profile,
};

use crate::changes;
use crate::db::Db;
use crate::ipc::{self, OmniboxTarget};
use crate::menus;
use crate::pages::{SCHEME, Source, serve_page};
use crate::perf::Perf;
use crate::placeholder;
use crate::sidebar::SidebarStore;
use crate::tabs;
use crate::window::{BrowserWindow, PlainWindow, QUITS_WITH_LAST_WINDOW, WindowId};
use crate::windows::Windows;

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
    /// Profiles being made (`profiles.create`) whose call has not finished: a
    /// change to the list in the meantime must not give them a default space,
    /// for the call gives them the one the user asked for.
    pub creating_profiles: Cell<u32>,
    /// The sidebar's performance run, if this is one.
    pub perf: Option<Perf>,
}

impl State {
    pub fn new(data: PathBuf, perf: Option<Perf>) -> State {
        State {
            ui_profile: RefCell::default(),
            devtools: RefCell::default(),
            windows: Windows::default(),
            sidebar: SidebarStore::new(&data),
            db: Db::open(&data),
            creating_profiles: Cell::new(0),
            perf,
        }
    }

    // Opens the windows open at the last quit, or else the first window, then
    // the user's own Profile, the one Chromium starts with, and each profile
    // they wait for, with the tabs they had (session.rs).
    fn start(self: &Rc<Self>, mt: MainThread) {
        // Each profile has a space before anything shows them. The list may
        // be read again once the first profile is open, in case it was not
        // filled yet.
        self.db.sync_profiles(&mt.profile_list(), true);
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
                if state.db.sync_profiles(&mt.profile_list(), true) {
                    ipc::broadcast_spaces(&state);
                }
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

    // ⌘W: the omnibox for a new tab, as if it were that tab; else the active
    // tab; or, with none of its own, the window, as Chrome's goes with its
    // last tab.
    fn close_tab(self: &Rc<Self>, mt: MainThread, window: &BrowserWindow) {
        if window.has_new_tab_omnibox() {
            return ipc::send_close_omnibox(window);
        }
        let active = window
            .browser()
            .filter(placeholder::has_tabs)
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
    // restored window or one a page or the omnibox asked for, is shown in a
    // window of its own, on its profile's most recent space; an incognito one
    // closes, as other kinds (a popup) do. DevTools gets a plain window of
    // its own.
    fn browser_opened(
        &self,
        mt: MainThread,
        opened: Browser,
        kind: BrowserType,
        _: Option<Browser>,
    ) {
        if kind == BrowserType::Devtools {
            let window = PlainWindow::new(opened.clone());
            self.state.devtools.borrow_mut().insert(opened, window);
            return;
        }
        if kind == BrowserType::Normal {
            self.state.place_opened(mt, opened);
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
            let fill = state.creating_profiles.get() == 0;
            if state.db.sync_profiles(&mt.profile_list(), fill) {
                ipc::broadcast_spaces(state);
            }
        }
        for change in changes {
            let Some(browser) = &change.browser else {
                continue;
            };
            match change.kind {
                ChangeKind::ForegroundRequest => state.bring_forward(browser),
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
            changes::apply(&window, changes);
        }
    }

    // The window is the one of the Browser in the key window, or else the
    // one the user was in last.
    fn menu_command(&self, mt: MainThread, id: &str, browser: Option<Browser>) {
        let windows = &self.state.windows;
        let window = browser
            .and_then(|browser| windows.of(&browser))
            .or_else(|| windows.front());
        // On the space of the window in front, or with none, the one used last.
        if id == menus::NEW_WINDOW {
            return match window.as_ref().and_then(|window| window.space()) {
                Some(space) => self.state.open_window_on(mt, space),
                None => self.state.open_recent_window(mt),
            };
        }
        let Some(window) = window else {
            return;
        };
        // The page switches, so the sidebar slides as a press makes it.
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
    fn browser_closed(&self, mt: MainThread, browser: Browser) {
        let devtools = self.state.devtools.borrow_mut().remove(&browser);
        if devtools.is_some() {
            return;
        }
        let Some(window) = self.state.windows.of(&browser) else {
            return;
        };
        let space = window.remove(&browser);
        if window.is_closing() {
            if !window.has_browsers() {
                self.state.windows.remove(window.id);
                if QUITS_WITH_LAST_WINDOW && self.state.windows.len() == 0 {
                    mt.quit();
                }
            }
            return;
        }
        if space.is_some() && space == window.space() {
            ipc::send_no_browser(&window);
        }
    }
}
