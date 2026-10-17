// The app's state and Wren's callbacks.

use std::cell::{Cell, RefCell};
use std::rc::Rc;

use wren::{App, Browser, BrowserType, MainThread, Profile};

use crate::ipc;
use crate::pages::{SCHEME, Source, UI, serve_page};
use crate::window::PageWindow;

// What the app holds, shared with the closures it hands Wren.
#[derive(Default)]
pub struct State {
    /// The main window's counter (`counter.get`, `counter.add`).
    pub counter: Cell<i64>,
    profile: RefCell<Option<Profile>>,
    main: RefCell<Option<PageWindow>>,
}

impl State {
    fn open_main(self: &Rc<Self>, mt: MainThread) {
        let Some(profile) = self.profile.borrow().clone() else {
            return;
        };
        // Closing the main window quits the app.
        let Some(main) = PageWindow::open(&profile, &UI, "Wren", (1100.0, 760.0), move || {
            mt.quit();
            false
        }) else {
            eprintln!("Wren made no web view.");
            return mt.quit();
        };
        ipc::handle_ui(&main.web_view, self);
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
