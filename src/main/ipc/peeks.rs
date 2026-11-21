// What the page asks of a peek in front of another tab (peeks/): its three
// buttons, and a click on its overlay, which closes it as Close does.
// src/renderer/ipc/peeks.ts is the page's side. What the page is told of the
// peeks comes with its tabs (tabs.rs).

use wren::{MainThread, WebView};

use super::browser::tab;
use super::{WindowRef, with_browser};
use crate::peeks;

pub fn handle(web_view: &WebView, window: &WindowRef, mt: MainThread) {
    // The peek closes, and the tab behind it is shown again.
    let weak = window.clone();
    let _ = web_view.handle("peeks.close", move |id: i32| {
        with_browser(&weak, |_, browser| peeks::close(tab(mt, browser, id)?))
    });

    // The peek becomes a tab of the list.
    let weak = window.clone();
    let _ = web_view.handle("peeks.expand", move |id: i32| {
        with_browser(&weak, |_, browser| {
            let state = weak.state()?;
            peeks::expand(&state, mt, browser, tab(mt, browser, id)?)
        })
    });

    // The peek and the tab behind it become a split of the list.
    let weak = window.clone();
    let _ = web_view.handle("peeks.split", move |id: i32| {
        with_browser(&weak, |_, browser| {
            let state = weak.state()?;
            peeks::split(&state, mt, browser, tab(mt, browser, id)?)
        })
    });
}
