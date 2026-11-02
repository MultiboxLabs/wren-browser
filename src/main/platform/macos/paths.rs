// macOS's side of platform/paths.rs: Application Support, and the app
// bundle's resources.

use std::path::PathBuf;

pub fn data_dir() -> PathBuf {
    home_dir().join("Library/Application Support")
}

pub fn home_dir() -> PathBuf {
    PathBuf::from(std::env::var_os("HOME").expect("the user has a home folder"))
}

pub fn resources_dir() -> PathBuf {
    let executable = std::env::current_exe().expect("the app's executable has a path");
    // Contents/Resources, beside Contents/MacOS, which holds the executable.
    executable
        .parent()
        .and_then(|folder| folder.parent())
        .expect("the executable is in the app's bundle")
        .join("Resources")
}
