// The onboarding window's calls (onboarding.rs): those of its window, as any
// page's, the default browser's, as the Library's, bringing things over, as
// wren://migrate's (migrate.rs), and its own.
// src/renderer/ipc/onboarding.ts is the page's side.

use std::rc::{Rc, Weak};

use wren::{MainThread, WebView};

use super::default_browser;
use super::migrate::handle_migrate_in;
use super::window::{PageRef, handle_page};
use crate::app::State;
use crate::onboarding::Choices;
use crate::platform::PageWindow;

/// The onboarding window, as its page's handlers find it again.
#[derive(Clone)]
struct OnboardingRef(Weak<State>);

impl PageRef for OnboardingRef {
    fn app(&self) -> Result<Rc<State>, String> {
        Ok(self.0.upgrade().ok_or("The app is closing.")?)
    }

    fn with_page<A>(
        &self,
        run: impl FnOnce(&PageWindow) -> Result<A, String>,
    ) -> Result<A, String> {
        let page = self.app()?.onboarding().ok_or("Onboarding is over.")?;
        run(&page)
    }
}

pub fn handle_onboarding(web_view: &WebView, state: &Rc<State>, mt: MainThread) {
    handle_page(web_view, &OnboardingRef(Rc::downgrade(state)));

    // The browsers to bring things over from, what each has, and the run
    // that brings them, as on wren://migrate.
    handle_migrate_in(web_view, state, mt);

    // Whether Wren is the default browser, and asking the user to make it
    // so, as the Library does (default_browser.rs).
    default_browser::handle(web_view, mt);

    // The user is done, with what they chose: the window closes, and the
    // app starts.
    let weak = Rc::downgrade(state);
    let _ = web_view.handle("onboarding.finish", move |choices: Choices| {
        let state = weak.upgrade().ok_or("The app is closing.")?;
        state.finish_onboarding(mt, choices);
        Ok::<(), String>(())
    });
}
