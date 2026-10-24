// The tab switcher: ⌃Tab shows the window's tabs, the last used first,
// with the one before the active tab selected; each ⌃Tab more selects the
// next, and ⌃⇧Tab the one before. Letting go of Control goes
// to the tab selected, and Escape leaves it. The app hears the keys
// (keyboard.rs) and tells the page; the page keeps the order the tabs were
// used in, and draws the switcher (components/tab-switcher/).

use std::rc::Rc;

use serde::Serialize;
use wren::WebView;

use super::WindowRef;
use crate::app::State;
use crate::keyboard::{Key, KeyWatch};
use crate::window::BrowserWindow;

pub fn handle(web_view: &WebView, window: &WindowRef) {
    // The page closed the switcher itself (a tab chosen with the pointer,
    // the window left): the keys go back to the page and to Chromium.
    let weak = window.clone();
    let _ = web_view.handle("tabSwitcher.closed", move |()| -> Result<(), &str> {
        let state = weak.state()?;
        if state.tab_switcher.get() == Some(weak.id) {
            state.tab_switcher.set(None);
        }
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
// in DevTools' window, ⌃Tab is Chromium's.
fn take_key(state: &State, key: Key) -> bool {
    match key {
        Key::ControlTab { back } => {
            let window = (state.tab_switcher.get())
                .and_then(|id| state.windows.get(id))
                .or_else(|| state.windows.active())
                .filter(|window| window.browser_with_tabs().is_some());
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
