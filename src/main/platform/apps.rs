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

/// The icon of the app the platform knows as `id` (on macOS, its bundle
/// identifier), `size` points square at twice that in pixels, as a PNG;
/// None if no such app is installed.
pub fn installed_app_icon(id: &str, size: f64) -> Option<Vec<u8>> {
    current::apps::installed_app_icon(id, size)
}
