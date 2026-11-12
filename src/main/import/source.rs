// What a browser the user may bring their things over from is, as the rest
// of the app sees it. An engine (engines/: Chromium, Gecko, Safari) reads
// what every browser on it keeps; a source is a browser, whose every method
// is its engine's unless it keeps more (browsers/: spaces), as a class
// builds on the one it extends. Nothing here calls Wren: a source is read on
// a thread of its own (run.rs), and what it read is landed on the main
// thread (land/).

use std::io;
use std::path::PathBuf;
use std::time::{Duration, SystemTime};

use wren::{Cookie, HistoryEntry};

use super::data::{Bookmarks, Favicons, SpaceCount, Spaces, StoreExtension};

/// How many history entries a reader hands over at once: one of Wren's
/// `add_history` calls.
pub const HISTORY_BATCH: usize = 5_000;

/// How many cookies a reader hands over at once: one of Wren's
/// `add_cookies` calls.
pub const COOKIE_BATCH: usize = 1_000;

/// How far back Wren keeps history, which is all a survey counts.
const HISTORY_KEPT: Duration = Duration::from_secs(90 * 24 * 60 * 60);

/// The time before which a visit is past what Wren keeps.
pub fn history_kept_since() -> SystemTime {
    SystemTime::now() - HISTORY_KEPT
}

/// Which browser it is.
pub struct About {
    /// As the page names it, and `SOURCES` is kept in order of.
    pub id: &'static str,
    pub name: &'static str,
    /// Its app's ID on this platform: on macOS, its bundle identifier.
    pub app: &'static str,
}

/// One of a source's real profiles: none the browser keeps for itself, nor,
/// in one that keeps spaces, one no space of it points at.
#[derive(Clone, Debug, PartialEq)]
pub struct SourceProfile {
    /// Its folder's name, as the source names it.
    pub id: String,
    pub name: String,
    /// Its name is the one the source gave it, not the user's ("Person 1").
    pub default_name: bool,
    /// Where its files are.
    pub folder: PathBuf,
    /// Its picture, a PNG of the account it is signed in to, if the source
    /// shows one for it.
    pub picture: Option<PathBuf>,
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
    /// Spaces, and their pins with the favourites; none from a source that
    /// keeps no spaces.
    pub spaces: Option<SpaceCount>,
    pub bookmarks: usize,
    /// Pages visited since `history_kept_since`.
    pub history: usize,
    /// Cookies, which a run counts as they land.
    pub cookies: usize,
    /// Sites with cookies, which the page shows.
    pub cookie_sites: usize,
    pub extensions: Vec<StoreExtension>,
    /// Some of it could not be read until the user allows it.
    pub no_access: bool,
}

impl Survey {
    /// Notes what reading a count met: a count of none, or the access it
    /// needs.
    pub fn count<T: Default>(&mut self, read: Result<T, ReadError>) -> T {
        match read {
            Ok(count) => count,
            Err(ReadError::NoAccess) => {
                self.no_access = true;
                T::default()
            }
            Err(_) => T::default(),
        }
    }

    /// Notes its cookies and the sites they are for, read as `count`.
    pub fn count_cookies(&mut self, read: Result<CookieCount, ReadError>) {
        let count = self.count(read);
        self.cookies = count.cookies;
        self.cookie_sites = count.sites;
    }
}

/// How many cookies a profile has, and for how many sites.
#[derive(Debug, Default)]
pub struct CookieCount {
    pub cookies: usize,
    pub sites: usize,
}

/// What every browser on an engine keeps, read from its files.
pub trait Engine: Sync {
    fn profiles(&self) -> Result<Vec<SourceProfile>, ReadError>;
    fn survey(&self, profile: &SourceProfile) -> Survey;
    fn bookmarks(&self, profile: &SourceProfile) -> Result<Bookmarks, ReadError>;
    /// Every page, handed over a batch at a time.
    fn history(
        &self,
        profile: &SourceProfile,
        batch: &mut dyn FnMut(Vec<HistoryEntry>),
    ) -> Result<(), ReadError>;
    /// Every cookie, decrypted, a batch at a time, and how many it could not
    /// read.
    fn cookies(
        &self,
        profile: &SourceProfile,
        batch: &mut dyn FnMut(Vec<Cookie>),
    ) -> Result<usize, ReadError>;
    /// The favicons it kept for `pages`, as PNGs, by page; none of a page
    /// it kept none for (favicons.rs). An engine that keeps none of a pin's
    /// kind gives none.
    fn favicons(&self, _profile: &SourceProfile, _pages: &[String]) -> Result<Favicons, ReadError> {
        Ok(Favicons::new())
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
    /// Its engine's survey, and its spaces if it keeps them.
    fn survey(&self, profile: &SourceProfile) -> Survey {
        let mut survey = self.engine().survey(profile);
        if self.keeps_spaces()
            && let Ok(spaces) = self.spaces(profile)
        {
            survey.spaces = Some(spaces.count());
        }
        survey
    }
    fn bookmarks(&self, profile: &SourceProfile) -> Result<Bookmarks, ReadError> {
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
    ) -> Result<usize, ReadError> {
        self.engine().cookies(profile, batch)
    }
    fn favicons(&self, profile: &SourceProfile, pages: &[String]) -> Result<Favicons, ReadError> {
        self.engine().favicons(profile, pages)
    }

    /// It keeps tabs in spaces, which come over as Wren's.
    fn keeps_spaces(&self) -> bool {
        false
    }
    /// Its spaces with their pins, and its favourites; none for a browser
    /// that keeps none. Their pages have no favicons: `favicons` gives them.
    fn spaces(&self, _profile: &SourceProfile) -> Result<Spaces, ReadError> {
        Ok(Spaces::default())
    }
}

impl dyn Source {
    /// Its real profile `id`, if it is still there.
    pub fn profile(&self, id: &str) -> Result<Option<SourceProfile>, ReadError> {
        Ok(self
            .profiles()?
            .into_iter()
            .find(|profile| profile.id == id))
    }
}
