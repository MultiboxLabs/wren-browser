// macOS's side of each part of platform/, under the same names.

pub mod clipboard;
pub mod files;
pub mod keyboard;
pub mod paths;
pub mod timer;
pub mod window;

// A Mac app keeps running with no window, as Chrome does, until the user
// quits it.
pub const QUITS_WITH_LAST_WINDOW: bool = false;
