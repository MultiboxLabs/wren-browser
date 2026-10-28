// Wren Components: an internal extension (a hidden component extension, which
// the user never sees on chrome://extensions or turns off) that holds the
// code Wren runs inside pages. Only this file knows the extension; its
// folder is extensions/wren-components, its parts one script for each site.

use wren::{AppExtension, Startup};

use crate::platform;

/// Lists it among the app's extensions. Its folder is in the app's
/// resources (`wren-app.json`).
pub fn ship(startup: &mut Startup) {
    let folder = platform::resources_dir().join("wren-components");
    startup
        .extensions
        .push(AppExtension::internal(folder.to_string_lossy()));
}
