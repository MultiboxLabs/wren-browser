// Onboarding: a window of its own that the user goes through before the app
// is theirs, on the first run and after Reset Onboarding (the DEVELOPMENT
// menu). Until it is finished no browser window opens, the user's profile
// is not opened, and the main menu has nothing of the browser's; the app
// starts (`State::start`) once it is. Its page is pages/onboarding, which
// says when the user is done (ipc/onboarding.rs).

use std::rc::Rc;

use serde::Deserialize;
use wren::MainThread;

use crate::app::State;
use crate::db::SpaceTheme;
use crate::ipc;
use crate::pages::ONBOARDING;
use crate::platform::{PageWindow, TitleBarKind, WindowSize};

/// The window's content, which the user cannot resize, as a setup
/// assistant's.
const SIZE: (f64, f64) = (920.0, 640.0);

/// What the user chose in onboarding, which the app takes as they finish.
#[derive(Debug, Deserialize)]
pub struct Choices {
    /// Their first space's.
    pub theme: SpaceTheme,
}

impl State {
    /// The onboarding window, while it is open.
    pub fn onboarding(&self) -> Option<Rc<PageWindow>> {
        self.onboarding.borrow().clone()
    }

    /// Opens the onboarding window, which shows itself once its page has
    /// drawn. Closing it quits the app, which is not the user's until they
    /// are done. False if it could not be opened.
    pub(crate) fn open_onboarding(self: &Rc<Self>, mt: MainThread) -> bool {
        let Some(profile) = self.ui_profile.borrow().clone() else {
            return false;
        };
        let Some(web_view) = ONBOARDING.web_view(&profile) else {
            return false;
        };
        let page = Rc::new(PageWindow::open(
            web_view,
            "Welcome to Wren",
            WindowSize::Fixed(SIZE),
            TitleBarKind::Page,
            move || {
                mt.quit();
                false
            },
        ));
        ipc::handle_onboarding(&page.web_view, self, mt);
        let weak = Rc::downgrade(&page);
        page.watch_active(mt, move |active| {
            if let Some(page) = weak.upgrade() {
                page.set_active(active);
                ipc::send_active(&page, active);
            }
        });
        *self.onboarding.borrow_mut() = Some(page);
        self.update_menu(mt);
        true
    }

    /// The user is done: what they chose is kept, it is noted, and the app
    /// starts as it does when there is no onboarding. The window goes once
    /// the page's call is over, not inside it.
    pub(crate) fn finish_onboarding(self: &Rc<Self>, mt: MainThread, choices: Choices) {
        if self.onboarding.borrow().is_none() {
            return;
        }
        if let Err(error) = self.db.set_first_space_theme(choices.theme) {
            eprintln!("Wren could not give the first space its theme: {error}");
        }
        if let Err(error) = self.db.set_onboarded(true) {
            eprintln!("Wren could not note that onboarding is done: {error}");
        }
        let state = Rc::downgrade(self);
        mt.later(move |mt| {
            let Some(state) = state.upgrade() else { return };
            let Some(window) = state.onboarding.take() else {
                return;
            };
            state.update_menu(mt);
            state.start(mt);
            drop(window);
        });
    }

    /// Reset Onboarding: the app forgets that the user went through it, and
    /// quits, so the next run starts with it again. The windows open now
    /// are kept, and come back once it is done.
    pub fn reset_onboarding(&self, mt: MainThread) {
        match self.db.set_onboarded(false) {
            Ok(()) => mt.quit(),
            Err(error) => eprintln!("Wren could not reset onboarding: {error}"),
        }
    }
}
