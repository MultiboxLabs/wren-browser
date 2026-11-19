// The tab switcher: ⌃Tab shows the five tabs used last, the last used first,
// with the one before the active tab selected; each ⌃Tab more selects the
// next, and ⌃⇧Tab the one before. Letting go of Control goes to the tab
// selected, and Escape leaves it. The app hears the keys
// (platform/keyboard.rs) and tells the page; the page keeps the order the
// tabs were used in, and draws the switcher (components/tab-switcher/),
// each card with its tab's picture (`tabs.preview`).

use std::cell::{Cell, RefCell};
use std::rc::Rc;

use serde::Serialize;
use wren::WebView;

use super::WindowRef;
use crate::analytics::Event;
use crate::app::State;
use crate::platform::{Key, KeyWatch};
use crate::windows::{BrowserWindow, WindowId};

/// What the tab switcher keeps between calls.
#[derive(Default)]
pub struct TabSwitcher {
    /// The window whose tab switcher is open, while ⌃ is held.
    open: Cell<Option<WindowId>>,
    // Hears the switcher's keys while it is kept.
    keys: RefCell<Option<KeyWatch>>,
}

pub fn handle(web_view: &WebView, window: &WindowRef) {
    let weak = window.clone();
    let _ = web_view.handle("tabSwitcher.closed", move |()| -> Result<(), &str> {
        let state = weak.state()?;
        if state.tab_switcher.open.get() == Some(weak.id) {
            state.tab_switcher.open.set(None);
        }
        state.analytics.record(Event::TabSwitcherUsed);
        Ok(())
    });
}

/// Starts hearing the switcher's keys, for as long as the app runs.
pub fn watch_tab_switcher_keys(state: &Rc<State>) {
    let weak = Rc::downgrade(state);
    let keys = KeyWatch::new(move |key| weak.upgrade().is_some_and(|state| take_key(&state, key)));
    *state.tab_switcher.keys.borrow_mut() = keys;
}

// Whether the switcher takes `key`: ⌃Tab in a browser window with tabs,
// and Control's release and Escape while the switcher is open. Elsewhere,
// in DevTools' window, ⌃Tab is Chromium's. A window a dialog blocks
// switches no tabs.
fn take_key(state: &State, key: Key) -> bool {
    match key {
        Key::ControlTab { back } => {
            let window = (state.tab_switcher.open.get())
                .and_then(|id| state.windows.get(id))
                .or_else(|| state.windows.active())
                .filter(|window| window.browser_with_tabs().is_some() && !window.is_blocked());
            let Some(window) = window else {
                return false;
            };
            state.tab_switcher.open.set(Some(window.id));
            send(&window, "tabSwitcher.step", &(if back { -1 } else { 1 }));
            true
        }
        Key::ControlUp | Key::Escape => {
            let Some(window) = state
                .tab_switcher
                .open
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
