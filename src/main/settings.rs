// The user's settings (db/settings.rs keeps them): what follows a change to
// them, and whether Wren is the default browser, which the Library shows
// beside them. A shorter time to archive tabs after archives those it makes
// due at once, the updater follows Automatic Updates and Beta Updates, and
// every profile follows the password manager and autofill. Analytics hears
// of each setting the user changes, once it may.

use std::rc::Rc;

use serde::Serialize;
use serde_json::Value;
use wren::MainThread;

use crate::analytics::{Event, Setting};
use crate::app::State;
use crate::db::{AddressBar, Settings, SettingsChange};
use crate::ipc;
use crate::menus;
use crate::profiles::filling::{self, Filler};
use crate::tabs::archive;

/// Sets what `change` has, does what follows from each setting, tells
/// every window, and gives every setting as it is now.
pub fn update(state: &State, change: SettingsChange) -> Result<Settings, String> {
    let changed = changed(&change);
    let fillers = [
        (Filler::PasswordManager, change.password_manager),
        (Filler::Autofill, change.autofill),
    ];
    let updates = change.automatic_updates.is_some() || change.beta_updates.is_some();
    let beta_was = state.db.settings()?.beta_updates;
    let settings = state.db.update_settings(change)?;
    if updates {
        state.updates.settings_changed(&settings, beta_was);
    }
    if let Some(mt) = MainThread::get() {
        for (filler, on) in fillers {
            if let Some(on) = on {
                filling::set(mt, filler, on);
            }
        }
    }
    state.analytics.set_on(settings.share_usage_data);
    for (setting, value) in changed {
        state
            .analytics
            .record(Event::SettingChanged { setting, value });
    }
    ipc::broadcast_settings(state, &settings);
    archive::archive_due(state);
    Ok(settings)
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
            .links_from_apps
            .map(|opens_in| (Setting::LinksFromApps, value(opens_in))),
        change
            .share_usage_data
            .map(|on| (Setting::ShareUsageData, value(on))),
    ]
    .into_iter()
    .flatten()
    .collect()
}

/// Moves the address to the other place, atop the sidebar or atop the page
/// (the main menu's Toggle Address Bar), and tells every window.
pub fn toggle_address_bar(state: &State) -> Result<(), String> {
    let address_bar = match state.db.settings()?.address_bar {
        AddressBar::Sidebar => AddressBar::Top,
        AddressBar::Top => AddressBar::Sidebar,
    };
    let change = SettingsChange {
        address_bar: Some(address_bar),
        ..SettingsChange::default()
    };
    let settings = state.db.update_settings(change)?;
    ipc::broadcast_settings(state, &settings);
    Ok(())
}

/// Asks macOS whether Wren is the default browser, at startup and as it
/// changes, as Wren's change says only that it did: Set as Default
/// Browser is checked as it is, and every window's page is told.
pub fn check_default_browser(state: &Rc<State>, mt: MainThread) {
    let state = Rc::downgrade(state);
    mt.default_browser_state(move |result| {
        let (Some(state), Ok(default)) = (state.upgrade(), result) else {
            return;
        };
        state.default_browser.set(Some(default));
        menus::set_default_browser_item(mt, Some(default));
        ipc::broadcast_default_browser(&state, default);
    });
}
