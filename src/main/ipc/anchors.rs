use std::rc::Rc;

use wren::{Browser, WebView};

use super::with_browser;
use crate::app::State;
use crate::main_window::{self, MainWindow};

pub fn handle(web_view: &WebView, state: &Rc<State>) {
    // The page's marks that one of Chromium's bubbles hangs off now, so
    // their buttons show as pressed while it is open; "anchors.showing"
    // says when that changes.
    let weak = Rc::downgrade(state);
    let _ = web_view.handle("anchors.showing", move |()| {
        with_browser(&weak, |_, browser| Ok(showing(browser)))
    });
}

/// Tells the page a bubble opened or closed on one of its marks.
pub fn send_anchors(main: &MainWindow, browser: &Browser) {
    let _ = main
        .page
        .web_view
        .send("anchors.showing", &showing(browser));
}

fn showing(browser: &Browser) -> Vec<String> {
    let mut marks: Vec<String> = main_window::marks(browser)
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
