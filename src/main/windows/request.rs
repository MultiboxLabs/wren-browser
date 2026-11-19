// What Chromium asks of a Browser's window: to move or resize, minimise,
// zoom or come back to normal, for an extension (`chrome.windows`), DevTools
// or a Mini Wren's page (`resizeTo`, `moveTo`); and the state a Browser it opens
// wants its window in. The app does as it asks; Chromium decides what may
// ask, and reads the window as it is after.

use wren::{Browser, RequestedBounds, WindowRequest, WindowState};

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
