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
use crate::sidebar::SidebarStore;
use crate::tabs;
use crate::window::{PlainWindow, WindowId};
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

    // Opens the first window, then the user's own Profile, the one Chromium
    // starts with, with the tabs it had when the app last quit.
    fn start(self: &Rc<Self>, mt: MainThread) {
        if self.open_window(mt, None).is_none() {
            eprintln!("Wren made no web view.");
            return mt.quit();
        }
        // Each profile has a space before anything shows them. The list may
        // be read again once the first profile is open, in case it was not
        // filled yet.
        self.db.sync_profiles(&mt.profile_list(), true);
        let state = self.clone();
        mt.open_profile(None, move |result| match result {
            Ok(profile) => {
                if state.db.sync_profiles(&mt.profile_list(), true) {
                    ipc::broadcast_spaces(&state);
                }
                state.restore(mt, profile)
            }
            Err(error) => {
                eprintln!("Wren opened no Profile: {error:?}");
                mt.quit();
            }
        });
    }

    // The close button of window `id`. The last window closes the app, which
    // keeps its session for the next run. Another leaves by closing its
    // Browsers, as Chrome's does, and goes once they have.
    pub(crate) fn close_window(self: &Rc<Self>, mt: MainThread, id: WindowId) {
        if self.windows.len() <= 1 {
            return mt.quit();
        }
        let Some(window) = self.windows.get(id) else {
            return;
        };
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
}

pub struct Wren {
    pub state: Rc<State>,
    pub source: Source,
}

impl App for Wren {
    fn ready(&self, mt: MainThread) {
        menus::set_main_menu(mt);
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
            if matches!(change.kind, ChangeKind::Tabs | ChangeKind::Tab)
                && let Some(browser) = &change.browser
                && let Some(window) = self.state.devtools.borrow().get(browser)
            {
                window.show_active_tab();
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
            let space = window
                .as_ref()
                .and_then(|window| window.space())
                .or_else(|| {
                    let recent = self.state.db.most_recent_space();
                    recent.ok().flatten().map(|space| space.id)
                });
            if let Some(space) = space {
                self.state.open_window_on(mt, space);
            }
            return;
        }
        let Some(window) = window else {
            return;
        };
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
        let Some(browser) = window.browser() else {
            // A space with no tab closes its window, as a window does in
            // Chrome once its last tab has.
            if id == menus::CLOSE_TAB {
                self.state.close_window(mt, window.id);
            }
            return;
        };
        let _ = match id {
            menus::CLOSE_TAB => match browser.active_tab() {
                Some(tab) => tabs::close(&browser, &[tab]),
                None => Ok(()),
            },
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

    // Chromium wants the address field: the omnibox opens on the active
    // tab's address, and stays open if it is.
    fn focus_location_bar(&self, _: MainThread, browser: Browser) {
        if let Some(window) = self
            .state
            .windows
            .of(&browser)
            .filter(|window| window.is_front(&browser))
        {
            ipc::send_show_omnibox(&window, OmniboxTarget::Current, false);
        }
    }

    // Chromium closes a Browser whose last tab closes. Its window stays, with
    // the space empty, unless the user is closing the window: that goes with
    // its last Browser, and the app with the last window.
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
                if self.state.windows.len() == 0 {
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
