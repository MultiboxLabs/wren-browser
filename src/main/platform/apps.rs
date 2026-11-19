// The other apps installed beside Wren, as the platform knows them.

use super::current;

/// Whether the app the platform knows as `id` (on macOS, its bundle
/// identifier) is installed.
pub fn is_app_installed(id: &str) -> bool {
    current::apps::is_app_installed(id)
}

/// Brings the app the platform knows as `id` (on macOS, its bundle
/// identifier) to the front, if it is running, as switching to it does.
/// Whether it was running.
pub fn activate_app(id: &str) -> bool {
    current::apps::activate_app(id)
}

/// An app that is running, as the platform knows it.
#[derive(Clone, Debug)]
pub struct RunningApp {
    /// On macOS, its bundle identifier.
    pub id: String,
    /// Its name, as people see it.
    pub name: String,
}

/// The app in front, if it is not Wren.
pub fn frontmost_other_app() -> Option<RunningApp> {
    current::apps::frontmost_other_app()
}

/// The preferences of the app the platform knows as `id`, as JSON: on
/// macOS, its defaults, from its property list in the user's Preferences
/// folder. None if it keeps none Wren can read.
pub fn app_preferences(id: &str) -> Option<serde_json::Value> {
    current::apps::app_preferences(id)
}

/// The icon of the app the platform knows as `id` (on macOS, its bundle
/// identifier), `size` points square at twice that in pixels, as a PNG;
/// None if no such app is installed.
pub fn installed_app_icon(id: &str, size: f64) -> Option<Vec<u8>> {
    current::apps::installed_app_icon(id, size)
}
