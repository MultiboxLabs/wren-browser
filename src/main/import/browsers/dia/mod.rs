// A Chromium-based browser that keeps spaces: Chromium's engine, and its
// sidebar, `tabs.db` in each profile (sidebar.rs). The sidebar is a SQLCipher
// database (sqlcipher.rs), locked with a key made from the one Chromium
// keeps its cookies under: HKDF-SHA256 of it, with the database's label for
// its info and, for its salt, an HMAC-SHA256 of the label under a key of the
// browser's own. A profile's label is `profile/<its folder>/<the
// database>`. As the key is the user's to give, a survey doesn't ask for
// it: it says only that the profile has spaces, and they are counted as
// they come over.
//
// Its bookmarks are Chromium's, but its bar's come over in a folder of their
// own, as its sidebar's tabs come over as its spaces' pins.
//
// Which folders are open is each window's, in Dia's preferences:
// `persistedWindowData` is JSON whose `windows` each list the folders
// (`expandedTabGroupIDs`) open in it. A folder open in any window comes
// over open.

mod sidebar;
mod sqlcipher;

use std::collections::HashSet;
use std::fs;
use std::path::PathBuf;

use serde_json::Value;

use crate::import::data::Spaces;
use crate::import::engines::chromium::Chromium;
use crate::import::source::{About, Engine, ReadError, Source, SourceProfile, SpaceSurvey, Survey};
use crate::platform::{self, BrowserKey, Hash};

/// The database its sidebar is in, in each profile, as its label names it.
const SIDEBAR: &str = "tabs";

/// The key it makes each database's salt with, from its app.
const LABEL_KEY: [u8; 32] = [
    0x88, 0xe7, 0xb5, 0x51, 0xef, 0xd7, 0xb6, 0x89, 0xdb, 0x89, 0xe1, 0x3f, 0xe6, 0x6d, 0x67, 0x02,
    0x07, 0xb0, 0xbd, 0x64, 0x25, 0x78, 0xf1, 0xd1, 0x70, 0xa9, 0xe8, 0x53, 0x5d, 0x04, 0xc8, 0xe3,
];

pub struct Dia {
    chromium: Chromium,
}

impl Dia {
    pub const fn new(chromium: Chromium) -> Dia {
        Dia { chromium }
    }
}

// Where a profile's sidebar is.
fn sidebar_file(profile: &SourceProfile) -> PathBuf {
    profile.folder.join(format!("{SIDEBAR}.db"))
}

// The key a profile's database `name` is locked with, made from `key`.
fn database_key(key: &BrowserKey, profile: &SourceProfile, name: &str) -> Vec<u8> {
    let label = format!("profile/{}/{name}", profile.id);
    let salt = platform::hmac(Hash::Sha256, &LABEL_KEY, &[label.as_bytes()]);
    platform::hkdf(Hash::Sha256, key.bytes(), &salt, label.as_bytes(), 32)
}

// The folders open in any of its windows, by ID; none if its preferences
// say nothing of them.
fn open_folders() -> HashSet<String> {
    let preferences = platform::home_dir().join("Library/Preferences/company.thebrowser.dia.plist");
    let Some(windows) = platform::read_property_list(&preferences)
        .ok()
        .and_then(|preferences| {
            serde_json::from_str::<Value>(preferences["persistedWindowData"].as_str()?).ok()
        })
    else {
        return HashSet::new();
    };
    windows["windows"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|window| window["expandedTabGroupIDs"].as_array())
        .flatten()
        .filter_map(|id| id.as_str().map(str::to_owned))
        .collect()
}

impl Source for Dia {
    fn about(&self) -> &About {
        Source::about(&self.chromium)
    }

    fn engine(&self) -> &dyn Engine {
        &self.chromium
    }

    fn survey(&self, profile: &SourceProfile) -> Survey {
        let mut survey = Engine::survey(&self.chromium, profile);
        if sidebar_file(profile).is_file() {
            survey.spaces = Some(SpaceSurvey::Locked);
        }
        survey
    }

    // Its sidebar's tabs are the pins its spaces come with, so the bar's
    // bookmarks come over in a folder of their own, not among them.
    fn bookmarks_bar_in_folder(&self) -> bool {
        true
    }

    fn keeps_spaces(&self) -> bool {
        true
    }

    fn spaces(&self, profile: &SourceProfile) -> Result<Spaces, ReadError> {
        let file = sidebar_file(profile);
        // That it is there, before the user is asked for the key to it.
        fs::metadata(&file)?;
        let key = database_key(&self.chromium.key()?, profile, SIDEBAR);
        let db = sqlcipher::open(&file, &key)?;
        sidebar::read(&db, &open_folders())
    }
}
