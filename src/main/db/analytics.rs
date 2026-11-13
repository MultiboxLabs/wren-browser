// What analytics (analytics/) keeps between runs, in rows of `settings` that
// the page never sees: the install's ID, a crash not sent yet, when the last
// of Crashpad's reports counted was written, and the usage counted since
// `app_opened` was last sent.

use std::collections::BTreeMap;
use std::path::Path;

use rusqlite::Connection;

use super::settings::{get, set};
use super::{Db, FILE};

const ID: &str = "analyticsId";
const PENDING_CRASH: &str = "pendingCrash";
const LAST_CRASH_REPORT: &str = "lastCrashReport";
const USAGE: &str = "usage";

/// Each count's name, and what it has come to.
pub type UsageCounts = BTreeMap<String, u64>;

/// The usage counted since `app_opened` was last sent, saved as it is counted
/// so that a crash or a forced quit loses none. It has a connection of its
/// own: `Analytics` counts from every part of the app, none of which hands it
/// the `Db`.
pub struct UsageStore {
    conn: Connection,
}

impl UsageStore {
    /// Opens the database in `data`, which `Db::open` has migrated already.
    pub fn open(data: &Path) -> Result<UsageStore, String> {
        let conn = Connection::open(data.join(FILE)).map_err(|error| error.to_string())?;
        Ok(UsageStore { conn })
    }

    /// The counts saved, or none if nothing was counted.
    pub fn load(&self) -> Result<UsageCounts, String> {
        Ok(get(&self.conn, USAGE)?.unwrap_or_default())
    }

    pub fn save(&self, counts: &UsageCounts) -> Result<(), String> {
        set(&self.conn, USAGE, counts)
    }
}

/// Where the app crashed (`analytics::Crash`'s location), for the next run to
/// send. It opens the database itself: the panic hook that calls it has no
/// `Db`, and may run on any thread.
pub fn record_crash(data: &Path, location: &str) -> Result<(), String> {
    let conn = Connection::open(data.join(FILE)).map_err(|error| error.to_string())?;
    set(&conn, PENDING_CRASH, &location)
}

impl Db {
    /// The install's ID, or `make`'s, kept from now on if there was none.
    pub fn analytics_id(&self, make: impl FnOnce() -> String) -> Result<String, String> {
        if let Some(id) = self.setting(ID)? {
            return Ok(id);
        }
        let id = make();
        set(&self.conn, ID, &id)?;
        Ok(id)
    }

    /// When the last of Crashpad's reports counted was written, in
    /// milliseconds since the epoch; none before the first count.
    pub fn last_crash_report(&self) -> Result<Option<u64>, String> {
        self.setting(LAST_CRASH_REPORT)
    }

    pub fn set_last_crash_report(&self, millis: u64) -> Result<(), String> {
        set(&self.conn, LAST_CRASH_REPORT, &millis)
    }

    /// The crash `record_crash` kept, if there is one, which is forgotten.
    pub fn take_crash(&self) -> Result<Option<String>, String> {
        let crash = self.setting(PENDING_CRASH)?;
        if crash.is_some() {
            self.forget(PENDING_CRASH)?;
        }
        Ok(crash)
    }
}

#[cfg(test)]
mod tests {
    use crate::db::test_db as db;

    #[test]
    fn keeps_the_id_it_makes() {
        let db = db();
        assert_eq!(db.analytics_id(|| "a".into()).unwrap(), "a");
        assert_eq!(db.analytics_id(|| "b".into()).unwrap(), "a");
    }

    #[test]
    fn keeps_the_usage_it_saves() {
        let store = super::UsageStore { conn: db().conn };
        assert!(store.load().unwrap().is_empty());
        let counts = super::UsageCounts::from([("tab_opened.sidebar".to_owned(), 3)]);
        store.save(&counts).unwrap();
        assert_eq!(store.load().unwrap(), counts);
    }

    #[test]
    fn takes_a_crash_once() {
        let db = db();
        assert_eq!(db.take_crash().unwrap(), None);
        super::set(&db.conn, super::PENDING_CRASH, &"src/main/app.rs:10").unwrap();
        assert_eq!(
            db.take_crash().unwrap().as_deref(),
            Some("src/main/app.rs:10")
        );
        assert_eq!(db.take_crash().unwrap(), None);
    }
}
