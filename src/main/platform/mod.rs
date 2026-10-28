// What the app asks of the platform itself, beyond Wren and the window: one
// file here for each part, its interface, and the same file in each
// platform's folder, its implementation. The rest of the app calls only
// what this module exports. macOS's is the only platform yet.

#[cfg(target_os = "macos")]
mod macos;

#[cfg(target_os = "macos")]
use macos as current;

mod files;
mod timer;

pub use files::{file_kind, file_thumbnail, file_type_icon};
pub use timer::after;
