// The sidebar's state, kept in a file of the app's data directory. The pages
// run in a Profile of their own that keeps nothing, so the page cannot keep
// it itself: it asks the app for it, and tells the app when it changes.

use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

/// What the sidebar keeps between runs.
#[derive(Serialize, Deserialize)]
pub struct SidebarState {
    /// Docked beside the page, rather than away.
    open: bool,
    /// The docked sidebar's width, in points.
    width: f64,
}

pub struct SidebarStore {
    file: PathBuf,
}

impl SidebarStore {
    pub fn new(data: &Path) -> SidebarStore {
        SidebarStore {
            file: data.join("sidebar.json"),
        }
    }

    /// What was last saved; none if nothing was, or the file can't be read.
    pub fn load(&self) -> Option<SidebarState> {
        let bytes = fs::read(&self.file).ok()?;
        serde_json::from_slice(&bytes).ok()
    }

    pub fn save(&self, state: &SidebarState) -> io::Result<()> {
        if let Some(directory) = self.file.parent() {
            fs::create_dir_all(directory)?;
        }
        // Written beside the file and renamed over it, so a crash mid-write
        // leaves the last state rather than half of the next.
        let partial = self.file.with_extension("json.tmp");
        fs::write(&partial, serde_json::to_vec(state)?)?;
        fs::rename(partial, &self.file)
    }
}
