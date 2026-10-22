use serde::Serialize;
use wren::{Browser, WebView};

use super::{WindowRef, failed, with_browser};
use crate::pages::icons;
use crate::window::BrowserWindow;

/// The Browser's side panel: which is open, if one is, and how wide.
#[derive(Serialize)]
pub struct SidePanel {
    open: bool,
    /// Chromium's name for it ("ReadingList", "Bookmarks", ...).
    id: String,
    /// In Chromium's language.
    title: String,
    /// An extension's panel: its action's icon, as an icon ID.
    icon: Option<String>,
    width: f64,
}

pub fn handle(web_view: &WebView, window: &WindowRef) {
    // The side panel; "sidePanel.state" says when it changes, Chromium's
    // own opening of one included.
    let weak = window.clone();
    let _ = web_view.handle("sidePanel.state", move |()| {
        with_browser(&weak, |_, browser| Ok(side_panel(browser)))
    });

    // Opens a panel by Chromium's name for it.
    let weak = window.clone();
    let _ = web_view.handle("sidePanel.show", move |id: String| {
        with_browser(&weak, |_, browser| {
            browser.show_side_panel(&id).map_err(failed)
        })
    });

    let weak = window.clone();
    let _ = web_view.handle("sidePanel.close", move |()| {
        with_browser(&weak, |_, browser| {
            browser.close_side_panel().map_err(failed)
        })
    });

    // The width the user drags the panel to, which Chromium keeps for the
    // kind of panel.
    let weak = window.clone();
    let _ = web_view.handle("sidePanel.setWidth", move |width: f64| {
        with_browser(&weak, |_, browser| {
            browser.set_side_panel_width(width).map_err(failed)
        })
    });
}

/// Tells the page the side panel opened, closed, or changed width.
pub fn send_side_panel(window: &BrowserWindow, browser: &Browser) {
    let _ = window
        .page
        .web_view
        .send("sidePanel.state", &side_panel(browser));
}

/// Tells the page no side panel is open: its space has no Browser.
pub fn send_no_side_panel(window: &BrowserWindow) {
    let none = SidePanel {
        open: false,
        icon: None,
        id: String::new(),
        title: String::new(),
        width: 0.0,
    };
    let _ = window.page.web_view.send("sidePanel.state", &none);
}

fn side_panel(browser: &Browser) -> SidePanel {
    let state = browser.side_panel_state().ok();
    let id = browser.side_panel_id();
    SidePanel {
        open: state.is_some_and(|state| state.open),
        icon: id
            .strip_prefix("Extension")
            .and_then(|extension| browser.extension_action_icon_png(extension, 16, 2.0, false))
            .map(icons::id),
        id,
        title: browser.side_panel_title(),
        width: state.map_or(0.0, |state| state.width),
    }
}
