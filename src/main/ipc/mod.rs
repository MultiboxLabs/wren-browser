// The calls the main window's page makes (`wren.invoke`), each by name, and
// the messages the app sends it (`wren.on`): one file for each part of the
// app. src/renderer/ipc/ is the page's side; keep the two together.

mod anchors;
mod browser;
mod extensions;
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
use crate::window::MainWindow;

pub use anchors::send_anchors;
pub use browser::{send_favicon, send_tabs};
pub use extensions::send_extensions;
pub use menu::send_toggle_sidebar;
pub use omnibox::{OmniboxTarget, send_omnibox, send_show_omnibox};
pub use side_panel::send_side_panel;
pub use site::send_site;
pub use toast::{OwnToast, send_toast, show_toast};
pub use window::{send_active, send_full_screen};

pub fn handle_ui(web_view: &WebView, state: &Rc<State>, mt: MainThread) {
    window::handle(web_view, state);
    sidebar::handle(web_view, state);
    browser::handle(web_view, state, mt);
    groups::handle(web_view, state, mt);
    splits::handle(web_view, state, mt);
    side_panel::handle(web_view, state);
    site::handle(web_view, state, mt);
    extensions::handle(web_view, state);
    anchors::handle(web_view, state);
    omnibox::handle(web_view, state);
    toast::handle(web_view, state);
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
    state: &Weak<State>,
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
    let found = with_browser(state, |main, browser| {
        Ok((main.page.web_view.view(), browser.clone()))
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

// A PNG of Wren's (a favicon, an extension's icon) as the page shows it.
fn png_url(png: Vec<u8>) -> String {
    format!("data:image/png;base64,{}", BASE64.encode(png))
}

fn failed(error: wren::Error) -> String {
    format!("{error:?}")
}

// Runs a handler with the main window, or fails the call once it is gone.
fn with_main<A>(
    state: &Weak<State>,
    handler: impl FnOnce(&MainWindow) -> Result<A, String>,
) -> Result<A, String> {
    let state = state.upgrade().ok_or("The app is closing.")?;
    let main = state.main.borrow();
    handler(main.as_ref().ok_or("The window is closing.")?)
}

// Runs a handler with the main window and its Browser in front, or fails
// the call while there is none.
fn with_browser<A>(
    state: &Weak<State>,
    handler: impl FnOnce(&MainWindow, &Browser) -> Result<A, String>,
) -> Result<A, String> {
    with_main(state, |main| {
        let browser = main.browser().ok_or("The window has no Browser yet.")?;
        handler(main, &browser)
    })
}
