// Updates, as the sidebar's card shows them (components/sidebar/update.tsx).
// Check for Updates… asks the window the user browses in, whose card opens
// on an update; with none, the window says so in a toast. Until the app has
// an updater, the page's stand-in (state/update.ts) answers the check.

use serde::Deserialize;
use wren::WebView;

use super::{OwnToast, WindowRef, failed, show_toast, with_browser};
use crate::shell::BrowserWindow;

/// What a check found, when it shows no update.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
enum Checked {
    UpToDate,
    Failed,
}

pub fn handle(web_view: &WebView, window: &WindowRef) {
    // The page's answer to "update.check", when it has no update to show.
    let weak = window.clone();
    let _ = web_view.handle("update.checked", move |checked: Checked| {
        with_browser(&weak, |_, browser| {
            let toast = match checked {
                Checked::UpToDate => OwnToast::UpToDate,
                Checked::Failed => OwnToast::UpdateCheckFailed,
            };
            show_toast(browser, toast).map_err(failed)
        })
    });
}

/// Check for Updates…, from the main menu.
pub fn send_check_for_updates(window: &BrowserWindow) {
    let _ = window.page.web_view.send("update.check", &());
}
