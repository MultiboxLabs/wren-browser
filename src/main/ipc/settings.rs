// The user's settings, which the Library shows and changes (settings.rs
// does what follows a change); `settings.changed` tells every window of
// one.

use wren::WebView;

use super::WindowRef;
use crate::app::State;
use crate::db::{Settings, SettingsChange};
use crate::settings;

pub fn handle(web_view: &WebView, window: &WindowRef) {
    let weak = window.clone();
    let _ = web_view.handle("settings.get", move |()| weak.state()?.db.settings());

    // Sets what it is given, and answers with every setting as it is now.
    let weak = window.clone();
    let _ = web_view.handle("settings.update", move |change: SettingsChange| {
        let state = weak.state()?;
        settings::update(&state, change)
    });
}

/// Tells every window the settings as they are now.
pub fn broadcast_settings(state: &State, settings: &Settings) {
    for window in state.windows.all() {
        let _ = window.page.web_view.send("settings.changed", settings);
    }
}
