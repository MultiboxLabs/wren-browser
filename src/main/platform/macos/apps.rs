// macOS's side of platform/apps.rs: NSWorkspace finds an installed app,
// and its icon, by its bundle identifier, and NSRunningApplication a
// running one.

use objc2_app_kit::{NSApplicationActivationOptions, NSRunningApplication, NSWorkspace};
use objc2_foundation::NSString;

use super::files::image_png;
use crate::platform::RunningApp;

pub fn is_app_installed(id: &str) -> bool {
    NSWorkspace::sharedWorkspace()
        .URLForApplicationWithBundleIdentifier(&NSString::from_str(id))
        .is_some()
}

pub fn activate_app(id: &str) -> bool {
    let running =
        NSRunningApplication::runningApplicationsWithBundleIdentifier(&NSString::from_str(id));
    running
        .firstObject()
        .is_some_and(|app| app.activateWithOptions(NSApplicationActivationOptions::empty()))
}

pub fn frontmost_other_app() -> Option<RunningApp> {
    let app = NSWorkspace::sharedWorkspace().frontmostApplication()?;
    let own = NSRunningApplication::currentApplication();
    if app.processIdentifier() == own.processIdentifier() {
        return None;
    }
    let id = app.bundleIdentifier()?.to_string();
    let name = app
        .localizedName()
        .map_or_else(|| id.clone(), |name| name.to_string());
    Some(RunningApp { id, name })
}

pub fn installed_app_icon(id: &str, size: f64) -> Option<Vec<u8>> {
    let workspace = NSWorkspace::sharedWorkspace();
    let app = workspace.URLForApplicationWithBundleIdentifier(&NSString::from_str(id))?;
    let path = app.path()?;
    image_png(&workspace.iconForFile(&path), size)
}
