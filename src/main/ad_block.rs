// The ad blocker: uBlock Origin, which every profile gets, on until the user
// turns it off. Chromium keeps whether it is on in each profile, and the
// Library turns it on or off there. Only this file knows the extension.

use serde::Serialize;
use wren::{AppExtension, Browser, Error, MainThread, ManifestV2, Startup};

/// uBlock Origin's ID, which its author's key gives it
/// (scripts/sync-ublock.ts).
const ID: &str = "fkgkibajhfbepljeaefdnfnegdcjomkh";

/// Lists it among the app's extensions, and lets it run, though it is
/// Manifest V2. Its file is in the app's resources (`wren-app.json`).
// TODO: allow it in incognito windows too, once Wren can say an app's
// extension runs there (it has no call for it yet). Until then it blocks
// nothing in them unless the user turns on "Allow in Incognito" on
// chrome://extensions.
pub fn ship(startup: &mut Startup) {
    let executable = std::env::current_exe().expect("the app's executable has a path");
    // Contents/Resources, beside Contents/MacOS, which holds the executable.
    let crx = executable
        .parent()
        .and_then(|folder| folder.parent())
        .expect("the executable is in the app's bundle")
        .join("Resources/uBlock0.crx");
    startup
        .extensions
        .push(AppExtension::bundled(crx.to_string_lossy(), true));
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

/// The profile's ad blocker, as `then` gets it.
pub fn read(
    mt: MainThread,
    profile_id: &str,
    then: impl FnOnce(Result<Option<AdBlock>, Error>) + 'static,
) {
    with_profile_browser(mt, profile_id, |browser| then(browser.map(state)));
}

/// Turns the profile's ad blocker on or off; `then` gets it after.
pub fn set(
    mt: MainThread,
    profile_id: &str,
    enabled: bool,
    then: impl FnOnce(Result<Option<AdBlock>, Error>) + 'static,
) {
    with_profile_browser(mt, profile_id, move |browser| {
        then(browser.and_then(|browser| {
            browser.set_extension_enabled(ID, enabled)?;
            Ok(state(browser))
        }))
    });
}

/// The ad blocker in the Browser's profile; None while it has none, as
/// Chromium installs it once the profile has loaded, or refused it.
pub fn state(browser: &Browser) -> Option<AdBlock> {
    browser.extension_state(ID).ok().map(|state| AdBlock {
        enabled: state.enabled,
        can_change: state.can_change,
    })
}

// Runs `then` with a Browser of the profile, as Chromium has a profile's
// extensions only through one: an open one, or with none, one made for
// this and closed after it. No window holds that one, so
// `App::browser_closed` passes it by.
// TODO: drop this for Wren 0.3.0's extension calls on a Profile (its
// roadmap's item 6); `read` and `set` then open the profile and ask it, and
// no Browser is made.
fn with_profile_browser(
    mt: MainThread,
    profile_id: &str,
    then: impl FnOnce(Result<&Browser, Error>) + 'static,
) {
    let open = mt.browsers().into_iter().find(|browser| {
        browser
            .profile()
            .is_some_and(|profile| profile.id() == profile_id)
    });
    if let Some(browser) = open {
        return then(Ok(&browser));
    }
    mt.open_profile(Some(profile_id), move |result| match result {
        Ok(profile) => profile.create_browser("", move |result| match result {
            Ok(browser) => {
                then(Ok(&browser));
                let _ = browser.close();
            }
            Err(error) => then(Err(error)),
        }),
        Err(error) => then(Err(error)),
    });
}
