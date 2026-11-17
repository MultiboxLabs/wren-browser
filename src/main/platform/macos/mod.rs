// macOS's side of each part of platform/, under the same names.

pub mod apps;
pub mod files;
pub mod keyboard;
pub mod paths;
pub mod property_list;
pub mod secrets;
pub mod shortcut;
pub mod system;
pub mod updater;
pub mod window;

// A Mac app keeps running with no window, as Chrome does, until the user
// quits it.
pub const QUITS_WITH_LAST_WINDOW: bool = false;
