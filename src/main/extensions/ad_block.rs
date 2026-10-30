// The ad blocker: uBlock Origin, which every profile gets, on until the user
// turns it off. Chromium keeps whether it is on in each profile, and the
// Library turns it on or off there. Only this file knows the extension.

use serde::Serialize;
use wren::{AppExtension, Error, MainThread, ManifestV2, Profile, Startup};

use crate::platform;

/// uBlock Origin's ID, which its author's key gives it
/// (scripts/sync-ublock.ts).
const ID: &str = "fkgkibajhfbepljeaefdnfnegdcjomkh";

/// Lists it among the app's extensions, and lets it run, though it is
/// Manifest V2, and in incognito windows too in a profile it is installed in
/// from now on. One that has it already keeps what the user chose there, on
/// chrome://extensions. Its file is in the app's resources (`wren-app.json`).
pub fn ship(startup: &mut Startup) {
    let crx = platform::resources_dir().join("uBlock0.crx");
    startup.extensions.push(AppExtension {
        allowed_in_incognito_on_install: true,
        ..AppExtension::bundled(crx.to_string_lossy(), true)
    });
    startup.manifest_v2 = ManifestV2::Listed;
    startup.manifest_v2_ids.push(ID.to_owned());
}

/// The ad blocker in a profile, as Chromium has it.
#[derive(Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AdBlock {
    enabled: bool,
    /// The user may turn it on or off: not while policy keeps it as it is,
    /// nor while Chromium turned it off for a reason of its own.
    can_change: bool,
}

/// The profile's ad blocker, as `then` gets it. A profile with no window is
/// loaded to be asked.
pub fn read(
    mt: MainThread,
    profile_id: &str,
    then: impl FnOnce(Result<Option<AdBlock>, Error>) + 'static,
) {
    mt.open_profile(Some(profile_id), move |profile| {
        then(profile.map(|profile| state(&profile)))
    });
}

/// Turns the profile's ad blocker on or off; `then` gets it after.
pub fn set(
    mt: MainThread,
    profile_id: &str,
    enabled: bool,
    then: impl FnOnce(Result<Option<AdBlock>, Error>) + 'static,
) {
    mt.open_profile(Some(profile_id), move |profile| {
        then(profile.and_then(|profile| {
            profile.set_extension_enabled(ID, enabled)?;
            Ok(state(&profile))
        }))
    });
}

/// The ad blocker in the profile; None while it has none, as Chromium
/// installs it once the profile has loaded, or refused it.
pub fn state(profile: &Profile) -> Option<AdBlock> {
    let state = profile.extension_state(ID).ok()?;
    Some(AdBlock {
        enabled: state.enabled,
        can_change: state.can_change,
    })
}
