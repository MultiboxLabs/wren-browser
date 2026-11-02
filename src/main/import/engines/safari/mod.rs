// Safari: the one source on WebKit, so its engine and itself. It keeps one
// profile, the Mac user's, in ~/Library/Safari, and its cookies in its
// container; macOS keeps both from Wren until the user gives it Full Disk
// Access. It has no Chrome Web Store extensions.

mod bookmarks;
mod cookies;
mod history;

use std::path::PathBuf;

use wren::{Cookie, HistoryEntry};

use crate::import::data::BookmarkFolder;
use crate::import::snapshot;
use crate::import::source::{About, Engine, ReadError, Source, SourceProfile, Survey};
use crate::platform;

pub struct Safari {
    about: About,
}

impl Safari {
    pub const fn new(about: About) -> Safari {
        Safari { about }
    }
}

fn folder() -> PathBuf {
    platform::home_dir().join("Library/Safari")
}

/// Seconds since 2001, as Apple keeps time, in milliseconds since 1970.
pub fn unix_ms(seconds: f64) -> i64 {
    ((seconds + 978_307_200.0) * 1000.0) as i64
}

impl Engine for Safari {
    fn profiles(&self) -> Result<Vec<SourceProfile>, ReadError> {
        // Its folder is there, whatever macOS lets Wren read inside it.
        if !folder().is_dir() {
            return Err(ReadError::Missing);
        }
        Ok(vec![SourceProfile {
            id: "Safari".into(),
            name: "Safari".into(),
            in_use: true,
            default_name: true,
            folder: folder(),
        }])
    }

    fn survey(&self, profile: &SourceProfile) -> Survey {
        let mut survey = Survey::default();
        survey.bookmarks = survey.count(bookmarks::read(&profile.folder).map(|tree| tree.count()));
        let history =
            snapshot::glance(&profile.folder.join("History.db")).and_then(|db| history::count(&db));
        survey.history = survey.count(history);
        survey.cookies = survey.count(cookies::count());
        survey
    }

    fn bookmarks(&self, profile: &SourceProfile) -> Result<BookmarkFolder, ReadError> {
        bookmarks::read(&profile.folder)
    }

    fn history(
        &self,
        profile: &SourceProfile,
        batch: &mut dyn FnMut(Vec<HistoryEntry>),
    ) -> Result<(), ReadError> {
        history::read(&profile.folder, batch)
    }

    fn cookies(
        &self,
        _profile: &SourceProfile,
        batch: &mut dyn FnMut(Vec<Cookie>),
    ) -> Result<(), ReadError> {
        cookies::read(batch)
    }
}

impl Source for Safari {
    fn about(&self) -> &About {
        &self.about
    }

    fn engine(&self) -> &dyn Engine {
        self
    }
}
