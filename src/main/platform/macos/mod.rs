// macOS's side of each part of platform/, under the same names.

pub mod apps;
pub mod files;
pub mod icon_menu;
pub mod keyboard;
pub mod main_thread;
pub mod paths;
pub mod system;
pub mod updater;
pub mod window;

// A Mac app keeps running with no window, as Chrome does, until the user
// quits it.
pub const QUITS_WITH_LAST_WINDOW: bool = false;
