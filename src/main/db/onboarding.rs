// Whether the user has been through onboarding (onboarding.rs), kept beside
// the settings, as one the page never sees: it is the app's, not theirs to
// change.

use super::settings::set;
use super::{Db, sql};

const KEY: &str = "onboarded";

impl Db {
    /// Whether the user has finished onboarding. An error counts as done, so
    /// a database that can't be read never keeps them from the app.
    pub fn onboarded(&self) -> bool {
        self.setting(KEY).unwrap_or_else(|error| {
            eprintln!("Wren could not read whether onboarding is done: {error}");
            Some(true)
        }) == Some(true)
    }

    /// Notes that the user has finished onboarding, or, for Reset
    /// Onboarding, that they have not.
    pub fn set_onboarded(&self, onboarded: bool) -> Result<(), String> {
        match onboarded {
            true => set(&self.conn, KEY, &true),
            false => self
                .conn
                .execute("DELETE FROM settings WHERE key = ?1", [KEY])
                .map(drop)
                .map_err(sql),
        }
    }
}

#[cfg(test)]
mod tests {
    use crate::db::test_db as db;

    #[test]
    fn is_not_done_until_it_is_set_and_again_once_reset() {
        let db = db();
        assert!(!db.onboarded());
        db.set_onboarded(true).unwrap();
        assert!(db.onboarded());
        db.set_onboarded(false).unwrap();
        assert!(!db.onboarded());
    }
}
