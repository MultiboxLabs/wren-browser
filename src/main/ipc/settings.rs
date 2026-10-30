// The user's settings (db/settings.rs), which the Library shows and changes;
// `settings.changed` tells every window of a change. A shorter time to
// archive tabs after archives those it makes due at once.

use wren::WebView;

use super::WindowRef;
use crate::app::State;
use crate::db::{Settings, SettingsChange};
use crate::tabs::archive;

pub fn handle(web_view: &WebView, window: &WindowRef) {
    let weak = window.clone();
    let _ = web_view.handle("settings.get", move |()| weak.state()?.db.settings());

    // Sets what it is given, and answers with every setting as it is now.
    let weak = window.clone();
    let _ = web_view.handle("settings.update", move |change: SettingsChange| {
        let state = weak.state()?;
        let settings = state.db.update_settings(change)?;
        state.analytics.set_on(settings.share_usage_data);
        broadcast_settings(&state, &settings);
        archive::archive_due(&state);
        Ok::<Settings, String>(settings)
    });
}

fn broadcast_settings(state: &State, settings: &Settings) {
    for window in state.windows.all() {
        let _ = window.page.web_view.send("settings.changed", settings);
    }
}
