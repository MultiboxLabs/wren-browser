// Gecko's engine: what every Gecko-based browser keeps, in the same files in
// each profile's folder. Firefox is this with its name; a browser that keeps
// more wraps it (browsers/). Its extensions are not the Chrome Web Store's,
// so none come over.

mod cookies;
mod favicons;
pub mod mozlz4;
mod places;
mod profiles;

use std::path::PathBuf;

use wren::{Cookie, HistoryEntry};

use crate::import::data::{Bookmarks, Favicons};
use crate::import::snapshot;
use crate::import::source::{About, Engine, ReadError, Source, SourceProfile, Survey};
use crate::platform;

pub struct Gecko {
    about: About,
    /// Its data folder, under the platform's (`platform::data_dir`), which
    /// holds `profiles.ini`.
    folder: &'static str,
}

impl Gecko {
    pub const fn new(about: About, folder: &'static str) -> Gecko {
        Gecko { about, folder }
    }

    pub fn root(&self) -> PathBuf {
        platform::data_dir().join(self.folder)
    }
}

impl Engine for Gecko {
    fn profiles(&self) -> Result<Vec<SourceProfile>, ReadError> {
        profiles::read(&self.root())
    }

    fn survey(&self, profile: &SourceProfile) -> Survey {
        let mut survey = Survey::default();
        let places = snapshot::glance(&profile.folder.join("places.sqlite"));
        let (bookmarks, history) = match &places {
            Ok(db) => (places::bookmark_count(db), places::history_count(db)),
            Err(ReadError::NoAccess) => (Err(ReadError::NoAccess), Err(ReadError::NoAccess)),
            Err(_) => (Ok(0), Ok(0)),
        };
        survey.bookmarks = survey.count(bookmarks);
        survey.history = survey.count(history);
        let cookies = snapshot::glance(&profile.folder.join("cookies.sqlite"))
            .and_then(|db| cookies::count(&db));
        survey.cookies = survey.count(cookies);
        survey
    }

    fn bookmarks(&self, profile: &SourceProfile) -> Result<Bookmarks, ReadError> {
        places::bookmarks(&profile.folder)
    }

    fn history(
        &self,
        profile: &SourceProfile,
        batch: &mut dyn FnMut(Vec<HistoryEntry>),
    ) -> Result<(), ReadError> {
        places::history(&profile.folder, batch)
    }

    fn cookies(
        &self,
        profile: &SourceProfile,
        batch: &mut dyn FnMut(Vec<Cookie>),
    ) -> Result<(), ReadError> {
        cookies::read(&profile.folder, batch)
    }

    fn favicons(&self, profile: &SourceProfile, pages: &[String]) -> Result<Favicons, ReadError> {
        favicons::read(&profile.folder, pages)
    }
}

impl Source for Gecko {
    fn about(&self) -> &About {
        &self.about
    }

    fn engine(&self) -> &dyn Engine {
        self
    }
}
