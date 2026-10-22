use wren::{Browser, WebView};

use super::{WindowRef, with_browser};
use crate::window::{BrowserWindow, marks};

pub fn handle(web_view: &WebView, window: &WindowRef) {
    // The page's marks that one of Chromium's bubbles hangs off now, so
    // their buttons show as pressed while it is open; "anchors.showing"
    // says when that changes.
    let weak = window.clone();
    let _ = web_view.handle("anchors.showing", move |()| {
        with_browser(&weak, |_, browser| Ok(showing(browser)))
    });
}

/// Tells the page a bubble opened or closed on one of its marks.
pub fn send_anchors(window: &BrowserWindow, browser: &Browser) {
    let _ = window
        .page
        .web_view
        .send("anchors.showing", &showing(browser));
}

/// Tells the page no bubble hangs off its marks: its space has no Browser.
pub fn send_no_anchors(window: &BrowserWindow) {
    let _ = window
        .page
        .web_view
        .send("anchors.showing", &Vec::<String>::new());
}

fn showing(browser: &Browser) -> Vec<String> {
    let mut marks: Vec<String> = marks(browser)
        .into_iter()
        .filter(|(anchor, _)| {
            browser
                .anchor_state(anchor)
                .is_ok_and(|state| state.showing)
        })
        .map(|(_, mark)| mark)
        .collect();
    marks.dedup();
    marks
}
