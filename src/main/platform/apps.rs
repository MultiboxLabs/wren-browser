// The other apps installed beside Wren, as the platform knows them.

use super::current;

/// The icon of the app the platform knows as `id` (on macOS, its bundle
/// identifier), `size` points square at twice that in pixels, as a PNG;
/// None if no such app is installed.
pub fn installed_app_icon(id: &str, size: f64) -> Option<Vec<u8>> {
    current::apps::installed_app_icon(id, size)
}
