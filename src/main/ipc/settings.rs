// The user's settings (db/settings.rs), which the Library shows and changes;
// `settings.changed` tells every window of a change. A shorter time to
// archive tabs after archives those it makes due at once, and the updater
// follows Automatic Updates and Beta Updates. Analytics hears of each
// setting the user changes, once it may.

use serde::Serialize;
use serde_json::Value;

use wren::{MainThread, WebView};

use super::WindowRef;
use crate::analytics::{Event, Setting};
use crate::app::State;
use crate::db::{Settings, SettingsChange};
use crate::password_manager;
use crate::tabs::archive;

pub fn handle(web_view: &WebView, window: &WindowRef) {
    let weak = window.clone();
    let _ = web_view.handle("settings.get", move |()| weak.state()?.db.settings());

    // Sets what it is given, and answers with every setting as it is now.
    let weak = window.clone();
    let _ = web_view.handle("settings.update", move |change: SettingsChange| {
        let state = weak.state()?;
        let changed = changed(&change);
        let password_manager = change.password_manager;
        let updates = change.automatic_updates.is_some() || change.beta_updates.is_some();
        let beta_was = state.db.settings()?.beta_updates;
        let settings = state.db.update_settings(change)?;
        if updates {
            state.updates.settings_changed(&settings, beta_was);
        }
        if let (Some(on), Some(mt)) = (password_manager, MainThread::get()) {
            password_manager::set(mt, on);
        }
        state.analytics.set_on(settings.share_usage_data);
        for (setting, value) in changed {
            state
                .analytics
                .record(Event::SettingChanged { setting, value });
        }
        broadcast_settings(&state, &settings);
        archive::archive_due(&state);
        Ok::<Settings, String>(settings)
    });
}

// The settings the user changes in `change`, with what each is now. Not the
// favourites' tip, which the user closes, not chooses.
fn changed(change: &SettingsChange) -> Vec<(Setting, Value)> {
    fn value(value: impl Serialize) -> Value {
        serde_json::to_value(value).unwrap_or_default()
    }
    [
        change
            .archive_after
            .map(|after| (Setting::ArchiveAfter, value(after))),
        change
            .automatic_updates
            .map(|on| (Setting::AutomaticUpdates, value(on))),
        change
            .beta_updates
            .map(|on| (Setting::BetaUpdates, value(on))),
        change
            .share_usage_data
            .map(|on| (Setting::ShareUsageData, value(on))),
    ]
    .into_iter()
    .flatten()
    .collect()
}

fn broadcast_settings(state: &State, settings: &Settings) {
    for window in state.windows.all() {
        let _ = window.page.web_view.send("settings.changed", settings);
    }
}
