// The app's state and Wren's callbacks.

use std::cell::RefCell;
use std::rc::Rc;

use wren::{App, Browser, BrowserType, Change, ChangeKind, MainThread, Profile, TabFields};

use crate::ipc;
use crate::main_window::MainWindow;
use crate::menus;
use crate::pages::{SCHEME, Source, UI, serve_page};
use crate::tabs;
use crate::window::PageWindow;

// What the app holds, shared with the closures it hands Wren.
#[derive(Default)]
pub struct State {
    // The pages', not the user's.
    ui_profile: RefCell<Option<Profile>>,
    pub main: RefCell<Option<MainWindow>>,
}

impl State {
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
    // the rest (a second restored window; popups and DevTools, which the
    // app does not show yet) close.
    fn browser_opened(
        &self,
        _: MainThread,
        opened: Browser,
        kind: BrowserType,
        _: Option<Browser>,
    ) {
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
        for change in changes {
            if change.browser.as_ref() != Some(&browser) {
                continue;
            }
            match change.kind {
                ChangeKind::Tabs | ChangeKind::Group | ChangeKind::Split => tabs_changed = true,
                ChangeKind::SidePanel => ipc::send_side_panel(main, &browser),
                ChangeKind::Tab => {
                    let Some(tab) = change.tab else { continue };
                    tabs_changed |= change.tab_fields.intersects(drawn);
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
    }

    fn menu_command(&self, _: MainThread, id: &str, _: Option<Browser>) {
        let main = self.state.main.borrow();
        let Some(main) = main.as_ref() else { return };
        if id == menus::TOGGLE_SIDEBAR {
            return ipc::send_toggle_sidebar(main);
        }
        let Some(browser) = main.browser() else {
            return;
        };
        let _ = match id {
            menus::NEW_TAB => tabs::new_tab(&browser),
            menus::CLOSE_TAB => match browser.active_tab() {
                Some(tab) => tabs::close(&browser, &[tab]),
                None => Ok(()),
            },
            _ => Ok(()),
        };
    }

    fn browser_closed(&self, mt: MainThread, browser: Browser) {
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
