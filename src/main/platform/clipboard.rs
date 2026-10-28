// The clipboard: the app writes text to it (Copy URL, a menu's Copy Link).
// TODO: drop this part, here and in each platform, for Wren 0.3.0's calls
// that read and write the clipboard; callers use those then.

use super::current;

/// Puts text on the clipboard, in place of what was there.
pub fn copy_text(text: &str) {
    current::clipboard::copy_text(text)
}
