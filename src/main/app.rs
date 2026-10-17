// The app's state and Wren's callbacks.

use std::cell::RefCell;
use std::rc::Rc;

use wren::{App, Browser, BrowserType, MainThread, Profile};

use crate::ipc;
use crate::pages::{SCHEME, Source, UI, serve_page};
use crate::window::PageWindow;

// What the app holds, shared with the closures it hands Wren.
#[derive(Default)]
pub struct State {
    profile: RefCell<Option<Profile>>,
    pub main: RefCell<Option<PageWindow>>,
}

impl State {
    fn open_main(self: &Rc<Self>, mt: MainThread) {
        let Some(profile) = self.profile.borrow().clone() else {
            return;
        };
        // Closing the main window quits the app.
        let Some(main) = PageWindow::open(&profile, &UI, "Wren", (1280.0, 800.0), move || {
            mt.quit();
            false
        }) else {
            eprintln!("Wren made no web view.");
            return mt.quit();
        };
        ipc::handle_ui(&main.web_view, self);
        // The page and the backdrop are drawn as in use while the window is.
        let state = Rc::downgrade(self);
        main.watch_active(mt, move |active| {
            let Some(state) = state.upgrade() else { return };
            if let Some(main) = state.main.borrow().as_ref() {
                main.set_active(active);
                ipc::send_active(main, active);
            }
        });
        let state = Rc::downgrade(self);
        main.watch_full_screen(move |full_screen| {
            let Some(state) = state.upgrade() else { return };
            if let Some(main) = state.main.borrow().as_ref() {
                ipc::send_full_screen(main, full_screen);
            }
        });
        *self.main.borrow_mut() = Some(main);
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
                *state.profile.borrow_mut() = Some(profile);
                state.open_main(mt);
            }
            Err(_) => mt.quit(),
        });
    }

    // Required: Chromium opened a Browser of its own (a popup, DevTools).
    // This app shows no Browsers yet, so it closes them.
    fn browser_opened(&self, _: MainThread, opened: Browser, _: BrowserType, _: Option<Browser>) {
        let _ = opened.close();
    }
}
