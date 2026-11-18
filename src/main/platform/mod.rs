// What the app asks of the platform itself, beyond Wren and the window: one
// file here for each part, its interface, and the same file in each
// platform's folder, its implementation. The rest of the app calls only
// what this module exports. macOS's is the only platform yet.

#[cfg(target_os = "macos")]
mod macos;

#[cfg(target_os = "macos")]
use macos as current;

mod apps;
mod files;
mod keyboard;
mod paths;
mod property_list;
mod secrets;
mod shortcut;
mod system;
mod updater;
mod window;

pub use apps::{
    RunningApp, activate_app, frontmost_other_app, installed_app_icon, is_app_installed,
};
pub use files::{file_kind, file_thumbnail, file_type_icon};
pub use keyboard::{Key, KeyWatch};
pub use paths::{data_dir, home_dir, resources_dir};
pub use property_list::read_property_list;
pub use secrets::{chromium_key, decrypt};
pub use shortcut::GlobalShortcut;
pub use system::{OS_NAME, Privacy, app_version, open_privacy_settings, os_version};
pub use updater::{Updater, UpdaterOptions, UpdaterState};
pub use window::{
    Backdrop, DevToolsWindow, PageWindow, WindowKind, WindowSize, close_other_key_window,
};

/// Whether closing the last window quits the app, as the platform's apps
/// do; or it keeps running with none, until the user quits it.
pub const QUITS_WITH_LAST_WINDOW: bool = current::QUITS_WITH_LAST_WINDOW;
