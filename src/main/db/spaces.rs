// The space queries. A space belongs to a profile, and goes with it.

use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::{OptionalExtension, Row, params};
use serde::{Deserialize, Serialize};

use super::theme::SpaceTheme;
use super::{Db, sql};

/// A space as it is kept, and as the page has it.
#[derive(Clone, Debug, Serialize)]
pub struct SpaceRow {
    pub id: i64,
    pub profile: String,
    pub name: String,
    pub icon: String,
    pub theme: SpaceTheme,
}

#[derive(Clone, Debug, Deserialize)]
pub struct NewSpace {
    pub name: String,
    pub icon: String,
    pub theme: SpaceTheme,
}

#[derive(Debug, Deserialize)]
pub struct SpaceChange {
    pub name: Option<String>,
    pub icon: Option<String>,
    pub theme: Option<SpaceTheme>,
}

const COLUMNS: &str = "id, profile_id, name, icon, theme";

fn row(row: &Row) -> rusqlite::Result<SpaceRow> {
    let json: String = row.get(4)?;
    Ok(SpaceRow {
        id: row.get(0)?,
        profile: row.get(1)?,
        name: row.get(2)?,
        icon: row.get(3)?,
        // A theme that can't be read is no reason to lose the list.
        theme: serde_json::from_str(&json).unwrap_or_else(|_| SpaceTheme::default_for("#ffffff")),
    })
}

fn name(name: &str) -> Result<String, String> {
    match name.trim() {
        "" => Err("A space needs a name.".into()),
        name => Ok(name.to_owned()),
    }
}

// `lucide:` and an icon's name, or an emoji (anything of at most 32 bytes
// with no ASCII in it).
fn icon(icon: &str) -> Result<String, String> {
    let named = icon.strip_prefix("lucide:").is_some_and(|name| {
        !name.is_empty()
            && name
                .bytes()
                .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-')
    });
    let emoji = !icon.is_empty() && icon.len() <= 32 && icon.chars().all(|char| !char.is_ascii());
    if named || emoji {
        Ok(icon.to_owned())
    } else {
        Err("That is not an icon a space can have.".into())
    }
}

fn json(theme: SpaceTheme) -> Result<(SpaceTheme, String), String> {
    let theme = theme.checked()?;
    let json = serde_json::to_string(&theme).map_err(|error| error.to_string())?;
    Ok((theme, json))
}

fn now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |since| since.as_secs() as i64)
}

impl Db {
    /// Every space, by profile and then by position.
    pub fn list_spaces(&self) -> Result<Vec<SpaceRow>, String> {
        let mut query = self
            .conn
            .prepare(&format!(
                "SELECT {COLUMNS} FROM spaces ORDER BY profile_id, position"
            ))
            .map_err(sql)?;
        query
            .query_map([], row)
            .and_then(|rows| rows.collect())
            .map_err(sql)
    }

    /// Adds a space to the end of the profile's, and the profile too if the
    /// database has not met it.
    pub fn create_space(&self, profile: &str, space: NewSpace) -> Result<SpaceRow, String> {
        let name = name(&space.name)?;
        let icon = icon(&space.icon)?;
        let (theme, json) = json(space.theme)?;
        let transaction = self.conn.unchecked_transaction().map_err(sql)?;
        let id = insert(&transaction, profile, &name, &icon, &json)?;
        transaction.commit().map_err(sql)?;
        Ok(SpaceRow {
            id,
            profile: profile.to_owned(),
            name,
            icon,
            theme,
        })
    }

    pub fn update_space(&self, id: i64, change: SpaceChange) -> Result<SpaceRow, String> {
        let name = change.name.as_deref().map(name).transpose()?;
        let icon = change.icon.as_deref().map(icon).transpose()?;
        let json = change.theme.map(json).transpose()?.map(|(_, json)| json);
        let changed = self
            .conn
            .execute(
                "UPDATE spaces SET name = coalesce(?2, name), icon = coalesce(?3, icon),
                 theme = coalesce(?4, theme) WHERE id = ?1",
                params![id, name, icon, json],
            )
            .map_err(sql)?;
        if changed == 0 {
            return Err("That space is gone.".into());
        }
        self.conn
            .query_row(
                &format!("SELECT {COLUMNS} FROM spaces WHERE id = ?1"),
                [id],
                row,
            )
            .map_err(sql)
    }

    /// Deletes a space, unless it is its profile's last.
    pub fn delete_space(&self, id: i64) -> Result<(), String> {
        let transaction = self.conn.unchecked_transaction().map_err(sql)?;
        let profile: Option<String> = transaction
            .query_row("SELECT profile_id FROM spaces WHERE id = ?1", [id], |row| {
                row.get(0)
            })
            .optional()
            .map_err(sql)?;
        let Some(profile) = profile else {
            return Err("That space is gone.".into());
        };
        let count: i64 = transaction
            .query_row(
                "SELECT count(*) FROM spaces WHERE profile_id = ?1",
                [&profile],
                |row| row.get(0),
            )
            .map_err(sql)?;
        if count <= 1 {
            return Err("A profile needs at least one space.".into());
        }
        transaction
            .execute("DELETE FROM spaces WHERE id = ?1", [id])
            .map_err(sql)?;
        transaction.commit().map_err(sql)
    }

    /// Makes sure the database has the profile, and gives it `default` as its
    /// space if it has none. Whether it added anything.
    pub fn ensure_space(&self, profile: &str, default: NewSpace) -> Result<bool, String> {
        let name = name(&default.name)?;
        let icon = icon(&default.icon)?;
        let (_, json) = json(default.theme)?;
        let transaction = self.conn.unchecked_transaction().map_err(sql)?;
        let mut added = transaction
            .execute("INSERT OR IGNORE INTO profiles (id) VALUES (?1)", [profile])
            .map_err(sql)?
            > 0;
        let spaces: i64 = transaction
            .query_row(
                "SELECT count(*) FROM spaces WHERE profile_id = ?1",
                [profile],
                |row| row.get(0),
            )
            .map_err(sql)?;
        if spaces == 0 {
            insert(&transaction, profile, &name, &icon, &json)?;
            added = true;
        }
        transaction.commit().map_err(sql)?;
        Ok(added)
    }
}

fn insert(
    transaction: &rusqlite::Transaction,
    profile: &str,
    name: &str,
    icon: &str,
    json: &str,
) -> Result<i64, String> {
    transaction
        .execute("INSERT OR IGNORE INTO profiles (id) VALUES (?1)", [profile])
        .map_err(sql)?;
    transaction
        .execute(
            "INSERT INTO spaces (profile_id, name, icon, theme, position, created_at)
             VALUES (?1, ?2, ?3, ?4,
                     (SELECT coalesce(max(position) + 1, 0) FROM spaces WHERE profile_id = ?1), ?5)",
            params![profile, name, icon, json, now()],
        )
        .map_err(sql)?;
    Ok(transaction.last_insert_rowid())
}
