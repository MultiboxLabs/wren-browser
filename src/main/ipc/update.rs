// Updates, as each window's card shows them (components/sidebar/
// update.tsx), from updates.rs: where the update is, the card's buttons,
// and Check for Updates…, which opens the card of the window it was chosen
// in.

use serde::Serialize;
use wren::{MainThread, WebView};

use super::WindowRef;
use crate::app::State;
use crate::updates::Shown;
use crate::windows::BrowserWindow;

/// The update as the window's page first reads it.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct First {
    #[serde(flatten)]
    shown: Shown,
    /// The window opened with the app on a version just installed: it plays
    /// what it shows of it, once.
    sweep: bool,
}

pub fn handle(web_view: &WebView, window: &WindowRef) {
    let weak = window.clone();
    let _ = web_view.handle("update.state", move |()| {
        let state = weak.state()?;
        Ok::<First, String>(First {
            shown: state.updates.shown(),
            sweep: state.updates.take_sweep(weak.id),
        })
    });

    let weak = window.clone();
    let _ = web_view.handle("update.download", move |()| {
        let state = weak.state()?;
        state.updates.download(&state);
        Ok::<(), String>(())
    });

    // Quits, as Chrome's Relaunch does, and the updater installs the update
    // before it launches the app again (`Updates::quit_committed`). A page
    // may hold the quit back.
    let _ = web_view.handle("update.restart", move |()| {
        let mt = MainThread::get().ok_or("Not on the main thread.")?;
        mt.relaunch();
        Ok::<(), String>(())
    });

    let weak = window.clone();
    let _ = web_view.handle("update.dismiss", move |()| {
        let state = weak.state()?;
        state.updates.dismiss(&state);
        Ok::<(), String>(())
    });
}

/// Tells every window where the update is.
pub fn broadcast_update(state: &State) {
    let shown = state.updates.shown();
    for window in state.windows.all() {
        let _ = window.page.web_view.send("update.changed", &shown);
    }
}

/// Check for Updates… found an update: the window's card opens on it.
pub fn send_open_update(window: &BrowserWindow) {
    let _ = window.page.web_view.send("update.open", &());
}
