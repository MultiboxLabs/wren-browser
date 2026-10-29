// The calls a browser window's page makes (`wren.invoke`), each by name, and
// the messages the app sends it (`wren.on`): one file for each part of the
// app. src/renderer/ipc/ is the page's side; keep the two together.

mod ad_block;
mod anchors;
mod browser;
mod downloads;
mod extensions;
mod find;
mod groups;
mod menu;
mod omnibox;
mod perf;
mod pins;
mod profiles;
mod quit;
mod settings;
mod side_panel;
mod sidebar;
mod site;
mod spaces;
mod splits;
mod tab_switcher;
mod toast;
mod window;

use std::rc::{Rc, Weak};

use serde::Deserialize;
use serde::de::DeserializeOwned;
use wren::{Browser, MainThread, NativeView, PageCall, WebView};

use crate::app::State;
use crate::tabs;
use crate::shell::{BrowserWindow, WindowId};

pub use ad_block::broadcast_ad_block;
pub use anchors::send_anchors;
pub use browser::{send_favicon, send_status, send_tabs};
pub use downloads::{
    downloads_changed, send_downloads, send_indicator, send_reveal, show_downloads_bubble,
};
pub use extensions::send_extensions;
pub use find::{send_find, send_show_find};
pub use menu::send_toggle_sidebar;
pub use omnibox::{
    OmniboxTarget, send_close_omnibox, send_omnibox, send_show_omnibox, stop_omnibox,
};
pub use pins::broadcast_pins;
pub use quit::{OpenQuitPrompt, quit_window_closing, show_quit_prompt};
pub use side_panel::send_side_panel;
pub use site::send_site;
pub use spaces::broadcast_spaces;
pub use tab_switcher::watch_tab_switcher_keys;
pub use toast::{OwnToast, send_toast, show_toast};
pub use window::{send_active, send_blocked, send_choose_space, send_full_screen};
use window::{send_profile, send_space};

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
    settings::handle(web_view, window);
    browser::handle(web_view, window, mt);
    groups::handle(web_view, window, mt);
    splits::handle(web_view, window, mt);
    side_panel::handle(web_view, window);
    site::handle(web_view, window, mt);
    extensions::handle(web_view, window);
    anchors::handle(web_view, window);
    omnibox::handle(web_view, window, mt);
    find::handle(web_view, window);
    toast::handle(web_view, window);
    quit::handle(web_view, window, mt);
    perf::handle(web_view, window, mt);
    profiles::handle(web_view, window, mt);
    ad_block::handle(web_view, window, mt);
    spaces::handle(web_view, window, mt);
    pins::handle(web_view, window);
    tab_switcher::handle(web_view, window);
    downloads::handle(web_view, window, mt);
}

/// Tells the page all it shows of `browser`, as it comes in front, and then
/// that its space is the window's: the page has the new space's tabs as it
/// switches to it.
pub fn send_browser(window: &BrowserWindow, browser: &Browser) {
    send_tabs(window, browser);
    send_side_panel(window, browser);
    send_site(window, browser);
    send_extensions(window, browser);
    send_anchors(window, browser);
    send_toast(window, browser);
    send_find(window, browser);
    send_downloads(window, browser);
    send_indicator(window, browser);
    send_blocked(window);
    send_profile(window);
    send_space(window);
}

/// Tells the page its space has no Browser, or it is on none: no tabs, and
/// nothing of one; then the space, as `send_browser` does.
pub fn send_no_browser(window: &BrowserWindow) {
    browser::send_no_tabs(window);
    side_panel::send_no_side_panel(window);
    site::send_no_site(window);
    extensions::send_no_extensions(window);
    anchors::send_no_anchors(window);
    toast::send_no_toast(window);
    find::send_no_find(window);
    downloads::send_no_indicator(window);
    send_blocked(window);
    send_profile(window);
    send_space(window);
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
// bar closes. Not a New Tab page's: Chromium would ask for the address field
// for it (App::focus_location_bar), and the omnibox that closed would open
// again.
fn give_back_keyboard(browser: &Browser) {
    if let Some(tab) = browser.active_tab()
        && !tabs::is_new_tab(&tab.url())
    {
        let _ = tab.focus();
    }
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
