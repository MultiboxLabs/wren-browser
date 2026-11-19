// What Chromium asks of a Browser's window: to move or resize, minimise,
// zoom or come back to normal, for an extension (`chrome.windows`), DevTools
// or a Mini Wren's page (`resizeTo`, `moveTo`); and the state a Browser it opens
// wants its window in. The app does as it asks; Chromium decides what may
// ask, and reads the window as it is after. A page asks for the whole
// window too (`fullscreen`).

use std::rc::Rc;

use wren::{Browser, MainThread, RequestedBounds, WindowRequest, WindowState};

use crate::app::State;
use crate::windows::BrowserWindow;

impl State {
    /// Does what Chromium asked of `browser`'s window. A window shows one
    /// space at a time, so a space's Browser in the background comes to the
    /// front of its window first, without the window coming forward.
    pub fn answer_window_request(&self, browser: &Browser, request: WindowRequest) {
        let Some(window) = self.windows.of(browser) else {
            return;
        };
        if !window.is_front(browser) {
            let space = window.place_of(browser).and_then(|place| place.space());
            let Some(space) = space else {
                return;
            };
            if let Err(error) = self.show_space(window.id, space) {
                return eprintln!("Wren did not do what Chromium asked of a window: {error}");
            }
        }
        match request {
            WindowRequest::Frame {
                x,
                y,
                width,
                height,
            } => window.move_to(RequestedBounds {
                origin: Some((x, y)),
                width,
                height,
            }),
            WindowRequest::State(state) => window.page.set_state(state),
        }
    }

    /// Minimises `window` if Chromium wants `browser`, which it opened or
    /// restored there, minimised: a window minimised as the session was
    /// kept, or an extension's created so. Only its Browser in front says.
    pub(super) fn start_as_requested(&self, window: &BrowserWindow, browser: &Browser) {
        if window.is_front(browser) && browser.requested_window_state() == WindowState::Minimized {
            window.minimize_when_shown();
        }
    }
}

/// A page of `browser` wants the whole window, or is done with it, for
/// `App::fullscreen`. Whether the window does as it asks: it goes full
/// screen for the page once Chromium's call is over, and Chromium hears
/// when it has (`BrowserWindow::full_screen_finished`). A page in the
/// background, or one leaving full screen the user chose, has its way at
/// once.
pub fn fullscreen(state: &Rc<State>, mt: MainThread, browser: &Browser, fullscreen: bool) -> bool {
    let Some(window) = state
        .windows
        .of(browser)
        .filter(|window| window.is_front(browser))
    else {
        return false;
    };
    if !window.wants_full_screen_for_page(fullscreen) {
        return false;
    }
    let state = Rc::downgrade(state);
    let id = window.id;
    mt.later(move |_| {
        let Some(state) = state.upgrade() else { return };
        if let Some(window) = state.windows.get(id) {
            window.page.set_full_screen(fullscreen);
        }
    });
    true
}
