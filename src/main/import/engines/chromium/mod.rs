// Chromium's engine: what every Chromium-based browser keeps, in the same
// files under its data folder. A plain one is this, with its name and
// folder (sources.rs); one that keeps more wraps it (browsers/).

mod bookmarks;
mod cookies;
mod extensions;
mod favicons;
mod history;
mod profiles;

use std::path::PathBuf;
use std::time::SystemTime;

use wren::{Cookie, HistoryEntry};

use crate::import::data::{Bookmarks, Favicons};
use crate::import::snapshot;
use crate::import::source::{About, Engine, ReadError, Source, SourceProfile, Survey};
use crate::platform;

/// The Keychain item a Chromium-based browser keeps its cookies' key in, on
/// macOS ("Chrome Safe Storage", "Chrome").
pub struct KeyItem {
    pub service: &'static str,
    pub account: &'static str,
}

pub struct Chromium {
    about: About,
    /// Its data folder, under the platform's (`platform::data_dir`).
    folder: &'static str,
    key: KeyItem,
    /// It keeps one profile, in its data folder itself.
    one_profile: bool,
}

impl Chromium {
    pub const fn new(about: About, folder: &'static str, key: KeyItem) -> Chromium {
        Chromium {
            about,
            folder,
            key,
            one_profile: false,
        }
    }

    /// One that keeps a single profile in its data folder itself.
    pub const fn with_one_profile(self) -> Chromium {
        Chromium {
            one_profile: true,
            ..self
        }
    }

    /// Its data folder.
    pub fn root(&self) -> PathBuf {
        platform::data_dir().join(self.folder)
    }
}

/// Microseconds from 1601, where Chromium's time starts, to 1970.
const FROM_1601: i64 = 11_644_473_600_000_000;

/// Chromium's time, microseconds since 1601, in milliseconds since 1970;
/// 0 for none.
fn unix_ms(time: i64) -> i64 {
    if time <= 0 {
        0
    } else {
        (time - FROM_1601) / 1000
    }
}

/// `time` in Chromium's time.
fn chromium_time(time: SystemTime) -> i64 {
    super::unix_micros(time) + FROM_1601
}

impl Engine for Chromium {
    fn profiles(&self) -> Result<Vec<SourceProfile>, ReadError> {
        profiles::read(&self.root(), self.one_profile, self.about.name)
    }

    fn survey(&self, profile: &SourceProfile) -> Survey {
        let mut survey = Survey::default();
        survey.bookmarks = survey.count(bookmarks::read(&profile.folder).map(|tree| tree.count()));
        let history =
            snapshot::glance(&profile.folder.join("History")).and_then(|db| history::count(&db));
        survey.history = survey.count(history);
        let cookies =
            snapshot::glance(&cookies::path(&profile.folder)).and_then(|db| cookies::count(&db));
        survey.count_cookies(cookies);
        survey.extensions = extensions::read(&profile.folder).unwrap_or_default();
        survey
    }

    fn bookmarks(&self, profile: &SourceProfile) -> Result<Bookmarks, ReadError> {
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
        profile: &SourceProfile,
        batch: &mut dyn FnMut(Vec<Cookie>),
    ) -> Result<(), ReadError> {
        cookies::read(&self.key, &self.root(), &profile.folder, batch)
    }

    fn favicons(&self, profile: &SourceProfile, pages: &[String]) -> Result<Favicons, ReadError> {
        favicons::read(&profile.folder, pages)
    }
}

impl Source for Chromium {
    fn about(&self) -> &About {
        &self.about
    }

    fn engine(&self) -> &dyn Engine {
        self
    }
}
