// What a browser the user may bring their things over from is, as the rest
// of the app sees it. An engine (engines/: Chromium, Gecko, Safari) reads
// what every browser on it keeps; a source is a browser, whose every method
// is its engine's unless it keeps more (browsers/: spaces), as a class
// builds on the one it extends. Nothing here calls Wren: a source is read on
// a thread of its own (run.rs), and what it read is landed on the main
// thread (land/).

use std::io;
use std::path::PathBuf;

use wren::{Cookie, HistoryEntry};

use super::data::{BookmarkFolder, Spaces, StoreExtension};

/// Which browser it is.
pub struct About {
    /// As the page names it, and `SOURCES` is kept in order of.
    pub id: &'static str,
    pub name: &'static str,
    /// Its app's ID on this platform: on macOS, its bundle identifier.
    pub app: &'static str,
}

/// One of a source's real profiles (decision 6 of the migration plan:
/// none of a browser's own, nor one no space of it points at).
#[derive(Clone, Debug, PartialEq)]
pub struct SourceProfile {
    /// Its folder's name, as the source names it.
    pub id: String,
    pub name: String,
    /// The one the source is used with.
    pub in_use: bool,
    /// Its name is the one the source gave it, not the user's ("Person 1").
    pub default_name: bool,
    /// Where its files are.
    pub folder: PathBuf,
}

/// Why something could not be read.
#[derive(Debug)]
pub enum ReadError {
    /// The source keeps none: the thing is left out.
    Missing,
    /// The system keeps it from Wren until the user allows it (on macOS,
    /// Full Disk Access).
    NoAccess,
    /// The user would not let Wren read the key it is locked with.
    Refused,
    /// It is there, but not as Wren knows it.
    Unreadable(String),
}

impl ReadError {
    /// What the page says of it.
    pub fn message(&self, source: &str) -> String {
        match self {
            ReadError::Missing => format!("{source} has none of it."),
            ReadError::NoAccess => "Wren needs Full Disk Access to read it.".into(),
            ReadError::Refused => format!("Wren was not let read {source}’s keys."),
            ReadError::Unreadable(why) => format!("Wren could not read it: {why}"),
        }
    }
}

impl From<io::Error> for ReadError {
    fn from(error: io::Error) -> ReadError {
        match error.kind() {
            io::ErrorKind::NotFound => ReadError::Missing,
            io::ErrorKind::PermissionDenied => ReadError::NoAccess,
            _ => ReadError::Unreadable(error.to_string()),
        }
    }
}

impl From<rusqlite::Error> for ReadError {
    fn from(error: rusqlite::Error) -> ReadError {
        // macOS refuses a protected file's open as SQLite's "unable to open".
        match &error {
            rusqlite::Error::SqliteFailure(failure, _)
                if failure.code == rusqlite::ErrorCode::CannotOpen =>
            {
                ReadError::NoAccess
            }
            _ => ReadError::Unreadable(error.to_string()),
        }
    }
}

impl From<serde_json::Error> for ReadError {
    fn from(error: serde_json::Error) -> ReadError {
        ReadError::Unreadable(error.to_string())
    }
}

/// How much a profile has of each thing, to show before any of it is read
/// in full; none of a thing it cannot say.
#[derive(Debug, Default)]
pub struct Survey {
    /// Spaces, and their pins with the favourites.
    pub spaces: Option<(usize, usize)>,
    pub bookmarks: usize,
    /// Pages visited in the past 90 days, which is all Wren keeps.
    pub history: usize,
    /// Sites with cookies.
    pub cookies: usize,
    pub extensions: Vec<StoreExtension>,
    /// Some of it could not be read until the user allows it.
    pub no_access: bool,
}

impl Survey {
    /// Notes what reading a count met: a count of none, or the access it
    /// needs.
    pub fn count(&mut self, read: Result<usize, ReadError>) -> usize {
        match read {
            Ok(count) => count,
            Err(ReadError::NoAccess) => {
                self.no_access = true;
                0
            }
            Err(_) => 0,
        }
    }
}

/// What every browser on an engine keeps, read from its files.
pub trait Engine: Sync {
    fn profiles(&self) -> Result<Vec<SourceProfile>, ReadError>;
    fn survey(&self, profile: &SourceProfile) -> Survey;
    fn bookmarks(&self, profile: &SourceProfile) -> Result<BookmarkFolder, ReadError>;
    /// Every page, handed over a batch at a time.
    fn history(
        &self,
        profile: &SourceProfile,
        batch: &mut dyn FnMut(Vec<HistoryEntry>),
    ) -> Result<(), ReadError>;
    /// Every cookie, decrypted, a batch at a time.
    fn cookies(
        &self,
        profile: &SourceProfile,
        batch: &mut dyn FnMut(Vec<Cookie>),
    ) -> Result<(), ReadError>;
    /// Its extensions from the Chrome Web Store; none for an engine whose
    /// extensions are not the store's.
    fn extensions(&self, _profile: &SourceProfile) -> Result<Vec<StoreExtension>, ReadError> {
        Ok(Vec::new())
    }
}

/// A browser the user may bring their things over from: its engine's
/// reader, and whatever it keeps beyond it. Each method is the engine's
/// unless the browser keeps that differently.
pub trait Source: Sync {
    fn about(&self) -> &About;
    fn engine(&self) -> &dyn Engine;

    fn profiles(&self) -> Result<Vec<SourceProfile>, ReadError> {
        self.engine().profiles()
    }
    fn survey(&self, profile: &SourceProfile) -> Survey {
        self.engine().survey(profile)
    }
    fn bookmarks(&self, profile: &SourceProfile) -> Result<BookmarkFolder, ReadError> {
        self.engine().bookmarks(profile)
    }
    fn history(
        &self,
        profile: &SourceProfile,
        batch: &mut dyn FnMut(Vec<HistoryEntry>),
    ) -> Result<(), ReadError> {
        self.engine().history(profile, batch)
    }
    fn cookies(
        &self,
        profile: &SourceProfile,
        batch: &mut dyn FnMut(Vec<Cookie>),
    ) -> Result<(), ReadError> {
        self.engine().cookies(profile, batch)
    }
    fn extensions(&self, profile: &SourceProfile) -> Result<Vec<StoreExtension>, ReadError> {
        self.engine().extensions(profile)
    }

    /// It keeps tabs in spaces, which come over as Wren's.
    fn keeps_spaces(&self) -> bool {
        false
    }
    /// Its spaces with their pins, and its favourites; none for a browser
    /// that keeps none.
    fn spaces(&self, _profile: &SourceProfile) -> Result<Spaces, ReadError> {
        Ok(Spaces::default())
    }
}
