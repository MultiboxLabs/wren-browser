// The ad blocker: uBlock Origin, which every profile gets, on until the user
// turns it off. Only this file knows the extension.

use wren::{AppExtension, ManifestV2, Startup};

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
