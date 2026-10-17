// The app's state and Wren's callbacks.

use std::cell::RefCell;
use std::rc::Rc;

use wren::{App, Browser, BrowserType, MainThread, Profile};

use crate::ipc;
use crate::main_window::MainWindow;
use crate::pages::{SCHEME, Source, UI, serve_page};
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
        ipc::handle_ui(&page.web_view, self);
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

        // The user's own Profile, the one Chromium starts with, and a
        // Browser of it in the window, on the New Tab page.
        let state = self.clone();
        mt.open_profile(None, move |result| match result {
            Ok(profile) => state.open_browser(mt, profile),
            Err(error) => {
                eprintln!("Wren opened no Profile: {error:?}");
                mt.quit();
            }
        });
    }

    // Adds a Browser of `profile` to the main window.
    fn open_browser(self: &Rc<Self>, mt: MainThread, profile: Profile) {
        let state = self.clone();
        profile.clone().create_browser("", move |result| {
            let browser = match result {
                Ok(browser) => browser,
                Err(error) => {
                    eprintln!("Wren opened no Browser: {error:?}");
                    return mt.quit();
                }
            };
            let main = state.main.borrow();
            let Some(main) = main.as_ref() else {
                let _ = browser.close();
                return;
            };
            main.add(profile, browser);
        });
    }
}

pub struct Wren {
    pub state: Rc<State>,
    pub source: Source,
}

impl App for Wren {
    fn ready(&self, mt: MainThread) {
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

    // Required: Chromium opened a Browser of its own (a popup, DevTools).
    // The app shows only its own Browsers yet, so it closes them.
    fn browser_opened(&self, _: MainThread, opened: Browser, _: BrowserType, _: Option<Browser>) {
        let _ = opened.close();
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
