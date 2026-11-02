// macOS's side of platform/apps.rs: NSWorkspace finds an installed app,
// and its icon, by its bundle identifier.

use objc2_app_kit::NSWorkspace;
use objc2_foundation::NSString;

use super::files::image_png;

pub fn is_app_installed(id: &str) -> bool {
    NSWorkspace::sharedWorkspace()
        .URLForApplicationWithBundleIdentifier(&NSString::from_str(id))
        .is_some()
}

pub fn installed_app_icon(id: &str, size: f64) -> Option<Vec<u8>> {
    let workspace = NSWorkspace::sharedWorkspace();
    let app = workspace.URLForApplicationWithBundleIdentifier(&NSString::from_str(id))?;
    let path = app.path()?;
    image_png(&workspace.iconForFile(&path), size)
}
