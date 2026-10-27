// What the app asks of the platform itself, beyond Wren and the window: one
// file here for each part, its interface, and the same file in each
// platform's folder, its implementation. The rest of the app calls only
// what this module exports. macOS's is the only platform yet.

#[cfg(target_os = "macos")]
mod macos;

#[cfg(target_os = "macos")]
use macos as current;

mod files;
mod keyboard;
mod main_thread;
mod paths;
mod system;
mod updater;
mod window;

pub use files::{file_kind, file_thumbnail, file_type_icon};
pub use keyboard::{Key, KeyWatch};
pub use main_thread::after;
pub use paths::{data_dir, resources_dir};
pub use system::{OS_NAME, app_version, os_version};
pub use updater::{Updater, UpdaterOptions, UpdaterState};
pub use window::{DevToolsWindow, PageWindow, TitleBarKind, WindowSize, close_other_key_window};

/// Whether closing the last window quits the app, as the platform's apps
/// do; or it keeps running with none, until the user quits it.
pub const QUITS_WITH_LAST_WINDOW: bool = current::QUITS_WITH_LAST_WINDOW;
