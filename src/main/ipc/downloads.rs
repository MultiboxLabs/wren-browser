// Downloads, as the page draws them (components/downloads/): the indicator
// on the Library button while they run. A window shows the downloads
// downloads/ lists for its Browser in front.

use wren::{Browser, Change, ChangeKind, WebView};

use super::{WindowRef, with_browser};
use crate::downloads::{self, Indicator};
use crate::shell::BrowserWindow;

pub fn handle(web_view: &WebView, window: &WindowRef) {
    // The downloads the window lists; "downloads.list" says when they
    // change.
    let weak = window.clone();
    let _ = web_view.handle("downloads.list", move |()| {
        with_browser(&weak, |found, browser| {
            let list = downloads::list(browser);
            found.note_downloads(&list);
            Ok(list)
        })
    });

    // The indicator, or null while none is drawn; "downloads.indicator"
    // says when it changes.
    let weak = window.clone();
    let _ = web_view.handle("downloads.indicator", move |()| {
        with_browser(&weak, |_, browser| Ok(downloads::indicator(browser)))
    });
}

/// Tells `window`'s page of the downloads it lists, unless they are as it
/// was told last: as they change, and as another Browser comes in front.
pub fn send_downloads(window: &BrowserWindow, browser: &Browser) {
    let list = downloads::list(browser);
    if window.note_downloads(&list) {
        let _ = window.page.web_view.send("downloads.list", &list);
    }
}

/// Whether `change` is to downloads `browser`'s window lists.
pub fn downloads_changed(change: &Change, browser: &Browser) -> bool {
    change.kind == ChangeKind::Downloads
        && change
            .profile
            .as_ref()
            .is_some_and(|changed| downloads::lists(browser, &changed.id()))
}

/// Tells `window`'s page of its indicator.
pub fn send_indicator(window: &BrowserWindow, browser: &Browser) {
    let _ = window
        .page
        .web_view
        .send("downloads.indicator", &downloads::indicator(browser));
}

/// Tells `window`'s page there is no indicator: its space has no Browser.
pub fn send_no_indicator(window: &BrowserWindow) {
    let _ = window
        .page
        .web_view
        .send("downloads.indicator", &None::<Indicator>);
}
