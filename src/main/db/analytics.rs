// What analytics (analytics/) keeps between runs, in rows of `settings` that
// the page never sees: the install's ID, the version that ran last, a crash
// not sent yet, and when the last of Crashpad's reports counted was written.

use std::path::Path;

use rusqlite::Connection;

use super::settings::set;
use super::{Db, FILE};

const ID: &str = "analyticsId";
const LAST_VERSION: &str = "lastVersion";
const PENDING_CRASH: &str = "pendingCrash";
const LAST_CRASH_REPORT: &str = "lastCrashReport";

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

    /// Notes that `version` runs, and answers with the one that ran before,
    /// if it was another. The first run has none before it.
    pub fn note_version(&self, version: &str) -> Result<Option<String>, String> {
        let last: Option<String> = self.setting(LAST_VERSION)?;
        if last.as_deref() == Some(version) {
            return Ok(None);
        }
        set(&self.conn, LAST_VERSION, &version)?;
        Ok(last)
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
            self.conn
                .execute("DELETE FROM settings WHERE key = ?1", [PENDING_CRASH])
                .map_err(super::sql)?;
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
    fn tells_of_a_new_version_once() {
        let db = db();
        assert_eq!(db.note_version("1.0.0").unwrap(), None);
        assert_eq!(db.note_version("1.0.0").unwrap(), None);
        assert_eq!(db.note_version("1.1.0").unwrap().as_deref(), Some("1.0.0"));
        assert_eq!(db.note_version("1.1.0").unwrap(), None);
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
