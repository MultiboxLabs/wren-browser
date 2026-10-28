// Where the app's files are: its data, and its own read-only resources.

use std::path::PathBuf;

use super::current;

/// The folder the platform keeps apps' data in, each in a folder of its
/// own (`Channel::data_folder`).
pub fn data_dir() -> PathBuf {
    current::paths::data_dir()
}

/// The folder of the app's own files, which it ships with and never
/// changes: uBlock Origin's package among them (`wren-app.json`).
pub fn resources_dir() -> PathBuf {
    current::paths::resources_dir()
}
