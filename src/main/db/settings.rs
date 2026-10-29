// The user's settings, which the Library changes. Each is a row of its own,
// its value in JSON; one never set, or whose value can't be read, is its
// default.

use std::time::Duration;

use rusqlite::{OptionalExtension, params};
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};

use super::{Db, sql};

/// Every setting, as the page has them.
#[derive(Clone, Copy, Debug, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub archive_after: ArchiveAfter,
    /// The user closed the box that shows where favourites go while there
    /// are none.
    pub favorites_tip_dismissed: bool,
}

/// What a change sets; each it leaves out stays as it is.
#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsChange {
    pub archive_after: Option<ArchiveAfter>,
    pub favorites_tip_dismissed: Option<bool>,
}

/// How long a tab goes unused before it is archived.
#[derive(Clone, Copy, Debug, Default, PartialEq, Serialize, Deserialize)]
pub enum ArchiveAfter {
    #[default]
    #[serde(rename = "12h")]
    TwelveHours,
    #[serde(rename = "24h")]
    TwentyFourHours,
    #[serde(rename = "7d")]
    SevenDays,
    #[serde(rename = "30d")]
    ThirtyDays,
}

impl ArchiveAfter {
    pub fn duration(self) -> Duration {
        const HOUR: u64 = 60 * 60;
        Duration::from_secs(match self {
            ArchiveAfter::TwelveHours => 12 * HOUR,
            ArchiveAfter::TwentyFourHours => 24 * HOUR,
            ArchiveAfter::SevenDays => 7 * 24 * HOUR,
            ArchiveAfter::ThirtyDays => 30 * 24 * HOUR,
        })
    }
}

impl Db {
    pub fn settings(&self) -> Result<Settings, String> {
        let defaults = Settings::default();
        Ok(Settings {
            archive_after: self
                .setting("archiveAfter")?
                .unwrap_or(defaults.archive_after),
            favorites_tip_dismissed: self
                .setting("favoritesTipDismissed")?
                .unwrap_or(defaults.favorites_tip_dismissed),
        })
    }

    /// Sets what `change` has, and answers with every setting as it is now.
    pub fn update_settings(&self, change: SettingsChange) -> Result<Settings, String> {
        let transaction = self.conn.unchecked_transaction().map_err(sql)?;
        if let Some(archive_after) = change.archive_after {
            set(&transaction, "archiveAfter", &archive_after)?;
        }
        if let Some(dismissed) = change.favorites_tip_dismissed {
            set(&transaction, "favoritesTipDismissed", &dismissed)?;
        }
        transaction.commit().map_err(sql)?;
        self.settings()
    }

    // A setting's value, or none if it was never set or can't be read.
    fn setting<T: DeserializeOwned>(&self, key: &str) -> Result<Option<T>, String> {
        let json: Option<String> = self
            .conn
            .query_row("SELECT value FROM settings WHERE key = ?1", [key], |row| {
                row.get(0)
            })
            .optional()
            .map_err(sql)?;
        Ok(json.and_then(|json| serde_json::from_str(&json).ok()))
    }
}

fn set(conn: &rusqlite::Connection, key: &str, value: &impl Serialize) -> Result<(), String> {
    let json = serde_json::to_string(value).map_err(|error| error.to_string())?;
    conn.execute(
        "INSERT INTO settings (key, value) VALUES (?1, ?2)
         ON CONFLICT (key) DO UPDATE SET value = excluded.value",
        params![key, json],
    )
    .map(drop)
    .map_err(sql)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::test_db as db;

    #[test]
    fn keeps_what_is_set_and_defaults_the_rest() {
        let db = db();
        assert_eq!(db.settings().unwrap(), Settings::default());
        let change = SettingsChange {
            archive_after: Some(ArchiveAfter::SevenDays),
            ..SettingsChange::default()
        };
        let settings = db.update_settings(change).unwrap();
        assert_eq!(settings.archive_after, ArchiveAfter::SevenDays);
        assert!(!settings.favorites_tip_dismissed);
        let change = SettingsChange {
            favorites_tip_dismissed: Some(true),
            ..SettingsChange::default()
        };
        assert!(db.update_settings(change).unwrap().favorites_tip_dismissed);
        // A change that sets nothing changes nothing.
        let settings = db.update_settings(SettingsChange::default()).unwrap();
        assert_eq!(settings.archive_after, ArchiveAfter::SevenDays);
        assert!(settings.favorites_tip_dismissed);
    }

    #[test]
    fn a_value_it_cannot_read_is_the_default() {
        let db = db();
        db.conn
            .execute(
                "INSERT INTO settings (key, value) VALUES ('archiveAfter', '\"1y\"')",
                [],
            )
            .unwrap();
        assert_eq!(
            db.settings().unwrap().archive_after,
            ArchiveAfter::TwelveHours
        );
    }
}
