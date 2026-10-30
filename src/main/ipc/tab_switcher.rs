// The tab switcher: ⌃Tab shows the five tabs used last, the last used first,
// with the one before the active tab selected; each ⌃Tab more selects the
// next, and ⌃⇧Tab the one before. Letting go of Control goes to the tab
// selected, and Escape leaves it. The app hears the keys
// (platform/keyboard.rs) and tells the page; the page keeps the order the
// tabs were used in, and draws the switcher (components/tab-switcher/),
// each card with a picture of its tab's page (pages/previews.rs).

use std::rc::Rc;

use serde::Serialize;
use wren::{CaptureOptions, ImageFormat, MainThread, WebView};

use super::browser::tab;
use super::{WindowRef, failed, with_browser};
use crate::analytics::Event;
use crate::app::State;
use crate::pages::previews;
use crate::platform::{Key, KeyWatch};
use crate::shell::BrowserWindow;

/// The largest a card's picture is, in pixels: a card's width at 2x, which
/// a split's two halves share.
const PREVIEW_SIZE: u32 = 320;

pub fn handle(web_view: &WebView, window: &WindowRef, mt: MainThread) {
    // A picture of the tab's page, as it draws it now, shown or not: the ID
    // it is served at (`previewUrl`), or null for a tab with none, such as
    // one discarded or crashed.
    let weak = window.clone();
    let _ = web_view.handle_call("tabSwitcher.preview", move |call| {
        let found = call
            .value::<i32>()
            .map_err(|error| error.to_string())
            .and_then(|id| with_browser(&weak, |_, browser| tab(mt, browser, id)));
        let tab = match found {
            Ok(tab) => tab,
            Err(error) => {
                let _ = call.fail(&error);
                return;
            }
        };
        let options = CaptureOptions {
            max_width: PREVIEW_SIZE,
            max_height: PREVIEW_SIZE,
            format: ImageFormat::Jpeg,
            // It stays in the app's own UI.
            ignore_policy: true,
            ..Default::default()
        };
        tab.capture(&options, move |image| {
            // A page that went before its answer is no error.
            let _ = match image {
                Ok(image) => call.answer(&Some(previews::keep(tab.id(), image.data))),
                Err(wren::Error::NoImage) => call.answer(&None::<String>),
                Err(error) => call.fail(&failed(error)),
            };
        });
    });

    // The page closed the switcher itself (a tab chosen with the pointer,
    // the window left): the keys go back to the page and to Chromium.
    let weak = window.clone();
    let _ = web_view.handle("tabSwitcher.closed", move |()| -> Result<(), &str> {
        let state = weak.state()?;
        if state.tab_switcher.get() == Some(weak.id) {
            state.tab_switcher.set(None);
        }
        state.analytics.record(Event::TabSwitcherUsed);
        Ok(())
    });
}

/// Starts hearing the switcher's keys, for as long as the app keeps what
/// this returns.
pub fn watch_tab_switcher_keys(state: &Rc<State>) -> Option<KeyWatch> {
    let state = Rc::downgrade(state);
    KeyWatch::new(move |key| state.upgrade().is_some_and(|state| take_key(&state, key)))
}

// Whether the switcher takes `key`: ⌃Tab in a browser window with tabs,
// and Control's release and Escape while the switcher is open. Elsewhere,
// in DevTools' window, ⌃Tab is Chromium's. A window a dialog blocks
// switches no tabs.
fn take_key(state: &State, key: Key) -> bool {
    match key {
        Key::ControlTab { back } => {
            let window = (state.tab_switcher.get())
                .and_then(|id| state.windows.get(id))
                .or_else(|| state.windows.active())
                .filter(|window| window.browser_with_tabs().is_some() && !window.is_blocked());
            let Some(window) = window else {
                return false;
            };
            state.tab_switcher.set(Some(window.id));
            send(&window, "tabSwitcher.step", &(if back { -1 } else { 1 }));
            true
        }
        Key::ControlUp | Key::Escape => {
            let Some(window) = state
                .tab_switcher
                .take()
                .and_then(|id| state.windows.get(id))
            else {
                return false;
            };
            let name = match key {
                Key::Escape => "tabSwitcher.cancel",
                _ => "tabSwitcher.release",
            };
            send(&window, name, &());
            true
        }
    }
}

fn send(window: &BrowserWindow, name: &str, value: &impl Serialize) {
    let _ = window.page.web_view.send(name, value);
}
