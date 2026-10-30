// The user's settings, which the Library changes. Each is a row of its own,
// its value in JSON; one never set, or whose value can't be read, is its
// default.

use std::time::Duration;

use rusqlite::{OptionalExtension, params};
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};

use super::{Db, sql};
use crate::channel::Channel;

/// Every setting, as the page has them.
#[derive(Clone, Copy, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub archive_after: ArchiveAfter,
    /// The user closed the box that shows where favourites go while there
    /// are none.
    pub favorites_tip_dismissed: bool,
    /// New versions of Wren download by themselves, to install as it
    /// restarts or quits.
    pub automatic_updates: bool,
    /// Wren takes beta versions too. On by default in a Beta build.
    pub beta_updates: bool,
    /// The build's channel: not a setting, but what the page needs to show
    /// Beta Updates, and what to say of it.
    pub channel: Channel,
    /// Wren sends which of its features are used, and its crashes
    /// (analytics/).
    pub share_usage_data: bool,
    /// The ad blocker starts on in a profile made from now on; each
    /// profile's is the user's to turn on or off after
    /// (extensions/ad_block.rs).
    pub block_ads_in_new_profiles: bool,
    /// Chromium's password manager is on in every profile; off, it saves,
    /// fills and suggests no password (password_manager.rs).
    pub password_manager: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Settings {
            archive_after: ArchiveAfter::default(),
            favorites_tip_dismissed: false,
            automatic_updates: true,
            beta_updates: Channel::current() == Channel::Beta,
            channel: Channel::current(),
            share_usage_data: true,
            block_ads_in_new_profiles: true,
            password_manager: true,
        }
    }
}

/// What a change sets; each it leaves out stays as it is.
#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsChange {
    pub archive_after: Option<ArchiveAfter>,
    pub favorites_tip_dismissed: Option<bool>,
    pub automatic_updates: Option<bool>,
    pub beta_updates: Option<bool>,
    pub share_usage_data: Option<bool>,
    pub block_ads_in_new_profiles: Option<bool>,
    pub password_manager: Option<bool>,
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
            automatic_updates: self
                .setting("automaticUpdates")?
                .unwrap_or(defaults.automatic_updates),
            beta_updates: self
                .setting("betaUpdates")?
                .unwrap_or(defaults.beta_updates),
            channel: defaults.channel,
            share_usage_data: self
                .setting("shareUsageData")?
                .unwrap_or(defaults.share_usage_data),
            block_ads_in_new_profiles: self
                .setting("blockAdsInNewProfiles")?
                .unwrap_or(defaults.block_ads_in_new_profiles),
            password_manager: self
                .setting("passwordManager")?
                .unwrap_or(defaults.password_manager),
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
        if let Some(automatic) = change.automatic_updates {
            set(&transaction, "automaticUpdates", &automatic)?;
        }
        if let Some(beta) = change.beta_updates {
            set(&transaction, "betaUpdates", &beta)?;
        }
        if let Some(share) = change.share_usage_data {
            set(&transaction, "shareUsageData", &share)?;
        }
        if let Some(block) = change.block_ads_in_new_profiles {
            set(&transaction, "blockAdsInNewProfiles", &block)?;
        }
        if let Some(on) = change.password_manager {
            set(&transaction, "passwordManager", &on)?;
        }
        transaction.commit().map_err(sql)?;
        self.settings()
    }

    /// The app's version at its last run, which the page never sees: none
    /// before the first (updates.rs).
    pub fn last_version(&self) -> Result<Option<String>, String> {
        self.setting("lastVersion")
    }

    pub fn set_last_version(&self, version: &str) -> Result<(), String> {
        set(&self.conn, "lastVersion", &version)
    }

    // A setting's value, or none if it was never set or can't be read.
    pub(super) fn setting<T: DeserializeOwned>(&self, key: &str) -> Result<Option<T>, String> {
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

pub(super) fn set(
    conn: &rusqlite::Connection,
    key: &str,
    value: &impl Serialize,
) -> Result<(), String> {
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
        // Updates are automatic until turned off.
        assert!(settings.automatic_updates);
        let change = SettingsChange {
            automatic_updates: Some(false),
            ..SettingsChange::default()
        };
        assert!(!db.update_settings(change).unwrap().automatic_updates);
        // Beta updates are off in a build that is not a beta, until turned on.
        assert!(!settings.beta_updates);
        let change = SettingsChange {
            beta_updates: Some(true),
            ..SettingsChange::default()
        };
        assert!(db.update_settings(change).unwrap().beta_updates);
        // Usage data is shared until turned off.
        assert!(settings.share_usage_data);
        let change = SettingsChange {
            share_usage_data: Some(false),
            ..SettingsChange::default()
        };
        assert!(!db.update_settings(change).unwrap().share_usage_data);
        // New profiles block ads until turned off.
        assert!(settings.block_ads_in_new_profiles);
        let change = SettingsChange {
            block_ads_in_new_profiles: Some(false),
            ..SettingsChange::default()
        };
        assert!(
            !db.update_settings(change)
                .unwrap()
                .block_ads_in_new_profiles
        );
        // The password manager is on until turned off.
        assert!(settings.password_manager);
        let change = SettingsChange {
            password_manager: Some(false),
            ..SettingsChange::default()
        };
        assert!(!db.update_settings(change).unwrap().password_manager);
        // A change that sets nothing changes nothing.
        let settings = db.update_settings(SettingsChange::default()).unwrap();
        assert_eq!(settings.archive_after, ArchiveAfter::SevenDays);
        assert!(settings.favorites_tip_dismissed);
    }

    #[test]
    fn keeps_the_last_version() {
        let db = db();
        assert_eq!(db.last_version().unwrap(), None);
        db.set_last_version("1.2.0").unwrap();
        assert_eq!(db.last_version().unwrap().as_deref(), Some("1.2.0"));
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
