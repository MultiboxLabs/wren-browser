// The app's state and Wren's callbacks.

use std::cell::RefCell;
use std::convert::Infallible;
use std::rc::{Rc, Weak};

use wren::{App, Browser, BrowserType, MainThread, Profile};

use crate::pages::{GAME, SCHEME, Source, UI, serve_page};
use crate::window::PageWindow;

// What the app holds, shared with the closures it hands Wren.
#[derive(Default)]
pub struct State {
    profile: RefCell<Option<Profile>>,
    main: RefCell<Option<PageWindow>>,
    game: RefCell<Option<PageWindow>>,
}

impl State {
    fn open_main(self: &Rc<Self>, mt: MainThread) {
        let Some(profile) = self.profile.borrow().clone() else {
            return;
        };
        // Closing the main window quits the app.
        let Some(main) = PageWindow::open(&profile, &UI, move || {
            mt.quit();
            false
        }) else {
            eprintln!("Wren made no web view.");
            return mt.quit();
        };
        let state = Rc::downgrade(self);
        let _ = main.web_view.handle("game.open", move |()| {
            if let Some(state) = state.upgrade() {
                mt.later(move |_| state.open_game(mt));
            }
            Ok::<_, Infallible>(())
        });
        *self.main.borrow_mut() = Some(main);
    }

    fn open_game(self: &Rc<Self>, mt: MainThread) {
        if let Some(game) = self.game.borrow().as_ref() {
            game.window.makeKeyAndOrderFront(None);
            return;
        }
        let Some(profile) = self.profile.borrow().clone() else {
            return;
        };
        // Closing the game's window lets it close, then drops its page.
        let state: Weak<State> = Rc::downgrade(self);
        let game = PageWindow::open(&profile, &GAME, move || {
            let state = state.clone();
            mt.later(move |_| {
                if let Some(state) = state.upgrade() {
                    state.game.borrow_mut().take();
                }
            });
            true
        });
        *self.game.borrow_mut() = game;
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
