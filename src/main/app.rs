// The app's state and Wren's callbacks.

use std::cell::RefCell;
use std::collections::HashMap;
use std::path::PathBuf;
use std::rc::Rc;

use wren::{
    App, Browser, BrowserType, Change, ChangeKind, MainThread, PopoverAnswer, PopoverKind,
    PopoverRequest, Profile, TabFields,
};

use crate::ipc::{self, OmniboxTarget};
use crate::menus;
use crate::pages::{SCHEME, Source, UI, serve_page};
use crate::sidebar::SidebarStore;
use crate::tabs;
use crate::window::{MainWindow, PageWindow, PlainWindow};

// What the app holds, shared with the closures it hands Wren.
pub struct State {
    // The pages', not the user's.
    ui_profile: RefCell<Option<Profile>>,
    devtools: RefCell<HashMap<Browser, PlainWindow>>,
    pub main: RefCell<Option<MainWindow>>,
    // What the main page keeps between runs, in `data`.
    pub sidebar: SidebarStore,
}

impl State {
    pub fn new(data: PathBuf) -> State {
        State {
            ui_profile: RefCell::default(),
            devtools: RefCell::default(),
            main: RefCell::default(),
            sidebar: SidebarStore::new(&data),
        }
    }

    fn open_main(self: &Rc<Self>, mt: MainThread) {
        let Some(profile) = self.ui_profile.borrow().clone() else {
            return;
        };
        // Closing the main window quits the app.
        let Some(page) = PageWindow::open(&profile, &UI, "Wren", (1280.0, 800.0), move || {
            mt.quit();
            false
        }) else {
            eprintln!("Wren made no web view.");
            return mt.quit();
        };
        ipc::handle_ui(&page.web_view, self, mt);
        // The page and the backdrop are drawn as in use while the window is.
        let state = Rc::downgrade(self);
        page.watch_active(mt, move |active| {
            let Some(state) = state.upgrade() else { return };
            if let Some(main) = state.main.borrow().as_ref() {
                main.page.set_active(active);
                ipc::send_active(&main.page, active);
            }
        });
        let state = Rc::downgrade(self);
        page.watch_full_screen(move |full_screen| {
            let Some(state) = state.upgrade() else { return };
            if let Some(main) = state.main.borrow().as_ref() {
                ipc::send_full_screen(&main.page, full_screen);
            }
        });
        let state = Rc::downgrade(self);
        page.watch_full_screen_finished(move |full_screen| {
            let Some(state) = state.upgrade() else { return };
            if let Some(main) = state.main.borrow().as_ref() {
                main.full_screen_finished(full_screen);
            }
        });
        *self.main.borrow_mut() = Some(MainWindow::new(page));

        // The user's own Profile, the one Chromium starts with, with the
        // tabs it had when the app last quit.
        let state = self.clone();
        mt.open_profile(None, move |result| match result {
            Ok(profile) => state.restore(mt, profile),
            Err(error) => {
                eprintln!("Wren opened no Profile: {error:?}");
                mt.quit();
            }
        });
    }

    // Restores `profile`'s last session, whose window arrives in
    // `browser_opened`; or, with nothing to restore, opens a Browser of it
    // on the New Tab page.
    fn restore(self: &Rc<Self>, mt: MainThread, profile: Profile) {
        let state = self.clone();
        profile.clone().restore_last_session(move |result| {
            if let Err(error) = result {
                eprintln!("Wren restored no session: {error:?}");
            }
            let restored = state
                .main
                .borrow()
                .as_ref()
                .is_some_and(|main| main.has_profile(&profile));
            if !restored {
                state.open_browser(mt, profile);
            }
        });
    }

    // Adds a new Browser of `profile` to the main window.
    fn open_browser(self: &Rc<Self>, mt: MainThread, profile: Profile) {
        let state = self.clone();
        profile
            .clone()
            .create_browser("", move |result| match result {
                Ok(browser) => state.show(profile, browser),
                Err(error) => {
                    eprintln!("Wren opened no Browser: {error:?}");
                    mt.quit();
                }
            });
    }

    // Shows `browser` in the main window as `profile`'s.
    fn show(&self, profile: Profile, browser: Browser) {
        let main = self.main.borrow();
        let Some(main) = main.as_ref() else {
            let _ = browser.close();
            return;
        };
        main.add(profile, browser.clone());
        // The page asked before there was a Browser.
        if main.is_front(&browser) {
            ipc::send_tabs(main, &browser);
            ipc::send_side_panel(main, &browser);
            ipc::send_site(main, &browser);
            ipc::send_extensions(main, &browser);
            ipc::send_anchors(main, &browser);
            ipc::send_toast(main, &browser);
        }
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
                state.open_main(mt);
            }
            Err(_) => mt.quit(),
        });
    }

    // Required: Chromium opened a Browser of its own. A restored window
    // becomes its Profile's Browser in the main window, if the window has
    // none of that Profile yet. The window shows one Browser for each, so
    // the rest (a second restored window or a popup) close. DevTools gets
    // a plain window of its own.
    fn browser_opened(
        &self,
        _: MainThread,
        opened: Browser,
        kind: BrowserType,
        _: Option<Browser>,
    ) {
        if kind == BrowserType::Devtools {
            let window = PlainWindow::new(opened.clone());
            self.state.devtools.borrow_mut().insert(opened, window);
            return;
        }
        let wanted = (kind == BrowserType::Normal)
            .then(|| opened.profile())
            .flatten()
            .filter(|profile| {
                self.state
                    .main
                    .borrow()
                    .as_ref()
                    .is_some_and(|main| !main.has_profile(profile))
            });
        match wanted {
            Some(profile) => self.state.show(profile, opened),
            None => {
                let _ = opened.close();
            }
        }
    }

    fn changed(&self, _: MainThread, changes: &[Change]) {
        for change in changes {
            if matches!(change.kind, ChangeKind::Tabs | ChangeKind::Tab)
                && let Some(browser) = &change.browser
                && let Some(window) = self.state.devtools.borrow().get(browser)
            {
                window.show_active_tab();
            }
        }
        let main = self.state.main.borrow();
        let Some(main) = main.as_ref() else { return };
        let Some(browser) = main.browser() else {
            return;
        };
        // What the sidebar draws of a tab, besides its favicon.
        let drawn = TabFields::TITLE
            | TabFields::URL
            | TabFields::LOADING
            | TabFields::HISTORY
            | TabFields::CRASHED
            | TabFields::GROUP
            | TabFields::SPLIT;
        let mut tabs_changed = false;
        // The site is the active tab's, which a switch or a navigation
        // changes as well as Chromium's word on it.
        let mut site_changed = false;
        let mut extensions_changed = false;
        for change in changes {
            // A new extension's anchor is named, in the background too.
            if change.kind == ChangeKind::ExtensionActions
                && let Some(changed) = &change.browser
            {
                main.name_anchors(changed);
            }
            if change.browser.as_ref() != Some(&browser) {
                continue;
            }
            match change.kind {
                ChangeKind::Tabs => {
                    tabs_changed = true;
                    site_changed = true;
                }
                // The tab in full screen is among them.
                ChangeKind::Group | ChangeKind::Split | ChangeKind::Fullscreen => {
                    tabs_changed = true
                }
                ChangeKind::SidePanel => ipc::send_side_panel(main, &browser),
                ChangeKind::Site => site_changed = true,
                ChangeKind::ExtensionActions => extensions_changed = true,
                ChangeKind::Anchors => ipc::send_anchors(main, &browser),
                ChangeKind::Omnibox => ipc::send_omnibox(main, &browser),
                // One the app answered has gone: Chromium's time for it is
                // up, the tab switched, or another came.
                ChangeKind::Popover => ipc::send_toast(main, &browser),
                ChangeKind::Tab => {
                    let Some(tab) = change.tab else { continue };
                    tabs_changed |= change.tab_fields.intersects(drawn);
                    site_changed |= change.tab_fields.contains(TabFields::URL)
                        && browser.active_tab() == Some(tab);
                    if change.tab_fields.contains(TabFields::FAVICON) {
                        ipc::send_favicon(main, tab);
                    }
                    // A newly active tab's page arrives in the page's
                    // element after the page asks for it, and gets the
                    // keyboard then.
                    if change.tab_fields.contains(TabFields::IN_ELEMENT)
                        && browser.active_tab() == Some(tab)
                        && tab.state().is_ok_and(|state| state.in_element)
                    {
                        let _ = tab.focus();
                    }
                }
                _ => {}
            }
        }
        if tabs_changed {
            ipc::send_tabs(main, &browser);
        }
        if site_changed {
            ipc::send_site(main, &browser);
        }
        // A pin or a pop-out shows or hides an extension's button, its mark.
        if extensions_changed {
            ipc::send_extensions(main, &browser);
            ipc::send_anchors(main, &browser);
        }
    }

    fn menu_command(&self, mt: MainThread, id: &str, _: Option<Browser>) {
        let main = self.state.main.borrow();
        let Some(main) = main.as_ref() else { return };
        if id == menus::TOGGLE_SIDEBAR {
            return ipc::send_toggle_sidebar(main);
        }
        if id == menus::NEW_TAB {
            return ipc::send_show_omnibox(main, OmniboxTarget::NewTab, true);
        }
        if id == menus::OPEN_LOCATION {
            return ipc::send_show_omnibox(main, OmniboxTarget::Current, true);
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
                None => main.page.web_view.open_dev_tools(),
            };
            if let Err(error) = result {
                eprintln!("Wren could not toggle UI DevTools: {error:?}");
            }
            return;
        }
        let Some(browser) = main.browser() else {
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

    // Toasts are the page's, at the window's top right: Chromium's
    // and the app's own alike. The page hears of one once Chromium's call
    // is over, when the request is open. The rest of Chromium's popovers
    // are its own still.
    fn popover(&self, mt: MainThread, request: &PopoverRequest) -> PopoverAnswer {
        if request.kind != PopoverKind::Toast {
            return PopoverAnswer::Chromium;
        }
        let state = Rc::downgrade(&self.state);
        let browser = request.browser.clone();
        mt.later(move |_| {
            let Some(state) = state.upgrade() else { return };
            if let Some(main) = state.main.borrow().as_ref()
                && main.is_front(&browser)
            {
                ipc::send_toast(main, &browser);
            }
        });
        PopoverAnswer::App
    }

    // A page wants the whole window, or is done with it. The window goes full
    // screen for it once Chromium's call is over, and Chromium hears when it
    // has (MainWindow::full_screen_finished). A page in the background, or
    // one leaving full screen the user chose, has its way at once.
    fn fullscreen(&self, mt: MainThread, browser: Browser, fullscreen: bool) -> bool {
        let main = self.state.main.borrow();
        let Some(main) = main.as_ref().filter(|main| main.is_front(&browser)) else {
            return false;
        };
        if !main.wants_full_screen_for_page(fullscreen) {
            return false;
        }
        let state = Rc::downgrade(&self.state);
        mt.later(move |_| {
            let Some(state) = state.upgrade() else { return };
            if let Some(main) = state.main.borrow().as_ref() {
                main.page.set_full_screen(fullscreen);
            }
        });
        true
    }

    // Chromium wants the address field: the omnibox opens on the active
    // tab's address, and stays open if it is.
    fn focus_location_bar(&self, _: MainThread, browser: Browser) {
        let main = self.state.main.borrow();
        if let Some(main) = main.as_ref().filter(|main| main.is_front(&browser)) {
            ipc::send_show_omnibox(main, OmniboxTarget::Current, false);
        }
    }

    fn browser_closed(&self, mt: MainThread, browser: Browser) {
        let devtools = self.state.devtools.borrow_mut().remove(&browser);
        if devtools.is_some() {
            return;
        }
        let main = self.state.main.borrow();
        let Some(main) = main.as_ref() else { return };
        // Chromium closes a Browser whose last tab closes. A window with no
        // Browser left has nothing to show, so it goes, and the app with it,
        // as when its close button is pressed.
        if main.remove(&browser) && main.is_empty() {
            mt.quit();
        }
    }
}
