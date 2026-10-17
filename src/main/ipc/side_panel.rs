use std::rc::Rc;

use serde::Serialize;
use wren::{Browser, WebView};

use super::{failed, with_browser};
use crate::app::State;
use crate::window::MainWindow;

/// The Browser's side panel: which is open, if one is, and how wide.
#[derive(Serialize)]
pub struct SidePanel {
    open: bool,
    /// Chromium's name for it ("ReadingList", "Bookmarks", ...).
    id: String,
    /// In Chromium's language.
    title: String,
    width: f64,
}

pub fn handle(web_view: &WebView, state: &Rc<State>) {
    // The side panel; "sidePanel.state" says when it changes, Chromium's
    // own opening of one included.
    let weak = Rc::downgrade(state);
    let _ = web_view.handle("sidePanel.state", move |()| {
        with_browser(&weak, |_, browser| Ok(side_panel(browser)))
    });

    // Opens a panel by Chromium's name for it.
    let weak = Rc::downgrade(state);
    let _ = web_view.handle("sidePanel.show", move |id: String| {
        with_browser(&weak, |_, browser| {
            browser.show_side_panel(&id).map_err(failed)
        })
    });

    let weak = Rc::downgrade(state);
    let _ = web_view.handle("sidePanel.close", move |()| {
        with_browser(&weak, |_, browser| {
            browser.close_side_panel().map_err(failed)
        })
    });

    // The width the user drags the panel to, which Chromium keeps for the
    // kind of panel.
    let weak = Rc::downgrade(state);
    let _ = web_view.handle("sidePanel.setWidth", move |width: f64| {
        with_browser(&weak, |_, browser| {
            browser.set_side_panel_width(width).map_err(failed)
        })
    });
}

/// Tells the page the side panel opened, closed, or changed width.
pub fn send_side_panel(main: &MainWindow, browser: &Browser) {
    let _ = main
        .page
        .web_view
        .send("sidePanel.state", &side_panel(browser));
}

fn side_panel(browser: &Browser) -> SidePanel {
    let state = browser.side_panel_state().ok();
    SidePanel {
        open: state.is_some_and(|state| state.open),
        id: browser.side_panel_id(),
        title: browser.side_panel_title(),
        width: state.map_or(0.0, |state| state.width),
    }
}
