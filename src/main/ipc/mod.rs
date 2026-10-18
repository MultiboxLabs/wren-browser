// The calls a browser window's page makes (`wren.invoke`), each by name, and
// the messages the app sends it (`wren.on`): one file for each part of the
// app. src/renderer/ipc/ is the page's side; keep the two together.

mod anchors;
mod browser;
mod extensions;
mod find;
mod groups;
mod menu;
mod omnibox;
mod side_panel;
mod sidebar;
mod site;
mod splits;
mod toast;
mod window;

use std::rc::{Rc, Weak};

use base64::Engine;
use base64::engine::general_purpose::STANDARD as BASE64;
use serde::Deserialize;
use serde::de::DeserializeOwned;
use wren::{Browser, MainThread, NativeView, PageCall, WebView};

use crate::app::State;
use crate::window::{BrowserWindow, WindowId};

pub use anchors::send_anchors;
pub use browser::{send_favicon, send_tabs};
pub use extensions::send_extensions;
pub use find::{send_find, send_show_find};
pub use menu::send_toggle_sidebar;
pub use omnibox::{OmniboxTarget, send_omnibox, send_show_omnibox};
pub use side_panel::send_side_panel;
pub use site::send_site;
pub use toast::{OwnToast, send_toast, show_toast};
pub use window::{send_active, send_full_screen};

/// The window a page is in, as its handlers find it again: not the window
/// itself, which owns the page and its handlers.
#[derive(Clone)]
pub struct WindowRef {
    state: Weak<State>,
    id: WindowId,
}

impl WindowRef {
    pub fn new(state: &Rc<State>, id: WindowId) -> WindowRef {
        WindowRef {
            state: Rc::downgrade(state),
            id,
        }
    }

    /// The app's state, unless the app is closing.
    fn state(&self) -> Result<Rc<State>, &'static str> {
        self.state.upgrade().ok_or("The app is closing.")
    }
}

pub fn handle_ui(web_view: &WebView, window: &WindowRef, mt: MainThread) {
    window::handle(web_view, window);
    sidebar::handle(web_view, window);
    browser::handle(web_view, window, mt);
    groups::handle(web_view, window, mt);
    splits::handle(web_view, window, mt);
    side_panel::handle(web_view, window);
    site::handle(web_view, window, mt);
    extensions::handle(web_view, window);
    anchors::handle(web_view, window);
    omnibox::handle(web_view, window);
    find::handle(web_view, window);
    toast::handle(web_view, window);
}

/// Where a context menu goes: what it is for (a tab's or a group's ID),
/// and the point in the page.
#[derive(Deserialize)]
struct MenuAt<Id> {
    id: Id,
    x: f64,
    y: f64,
}

// Answers a call for a context menu: `show` finds what the menu is for and
// shows it with `done`, which answers the call with the item chosen. A menu
// that is not shown drops `done`, and with it the call, which fails it.
fn menu_call<Id: DeserializeOwned>(
    window: &WindowRef,
    call: PageCall,
    show: impl FnOnce(
        NativeView,
        &Browser,
        MenuAt<Id>,
        Box<dyn FnOnce(Option<String>)>,
    ) -> Result<(), String>,
) {
    let at = match call.value::<MenuAt<Id>>() {
        Ok(at) => at,
        Err(error) => {
            let _ = call.fail(&error.to_string());
            return;
        }
    };
    let found = with_browser(window, |found, browser| {
        Ok((found.page.web_view.view(), browser.clone()))
    });
    let (view, browser) = match found {
        Ok(found) => found,
        Err(error) => {
            let _ = call.fail(&error);
            return;
        }
    };
    let done = Box::new(move |chosen: Option<String>| {
        let _ = call.answer(&chosen);
    });
    if let Err(error) = show(view, &browser, at, done) {
        eprintln!("Wren showed no menu: {error}");
    }
}

// The active tab's page has the keyboard back, as the omnibox or the find
// bar closes.
fn give_back_keyboard(browser: &Browser) {
    if let Some(tab) = browser.active_tab() {
        let _ = tab.focus();
    }
}

// A PNG of Wren's (a favicon, an extension's icon) as the page shows it.
fn png_url(png: Vec<u8>) -> String {
    format!("data:image/png;base64,{}", BASE64.encode(png))
}

fn failed(error: wren::Error) -> String {
    format!("{error:?}")
}

// Runs a handler with the page's window, or fails the call once it is gone.
fn with_window<A>(
    window: &WindowRef,
    handler: impl FnOnce(&BrowserWindow) -> Result<A, String>,
) -> Result<A, String> {
    let state = window.state()?;
    let found = state
        .windows
        .get(window.id)
        .ok_or("The window is closing.")?;
    handler(&found)
}

// Runs a handler with the page's window and its Browser in front, or fails
// the call while there is none.
fn with_browser<A>(
    window: &WindowRef,
    handler: impl FnOnce(&BrowserWindow, &Browser) -> Result<A, String>,
) -> Result<A, String> {
    with_window(window, |found| {
        let browser = found.browser().ok_or("The window has no Browser yet.")?;
        handler(found, &browser)
    })
}
