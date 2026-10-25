// The space queries. A space belongs to a profile, and goes with it.

use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::{OptionalExtension, Row, params};
use serde::{Deserialize, Serialize};

use super::theme::SpaceTheme;
use super::{Db, sql};

/// A space's ID, its row's.
pub type SpaceId = i64;

/// A space as it is kept, and as the page has it.
#[derive(Clone, Debug, Serialize)]
pub struct SpaceRow {
    pub id: SpaceId,
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

fn checked_name(name: &str) -> Result<String, String> {
    match name.trim() {
        "" => Err("A space needs a name.".into()),
        name => Ok(name.to_owned()),
    }
}

// `lucide:` and an icon's name, or an emoji (anything of at most 32 bytes
// with no ASCII in it).
fn checked_icon(icon: &str) -> Result<String, String> {
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

fn theme_json(theme: &SpaceTheme) -> Result<String, String> {
    serde_json::to_string(theme).map_err(|error| error.to_string())
}

impl NewSpace {
    /// The space as it is kept (trimmed, its theme in range), or why it can't be.
    pub fn checked(self) -> Result<NewSpace, String> {
        Ok(NewSpace {
            name: checked_name(&self.name)?,
            icon: checked_icon(&self.icon)?,
            theme: self.theme.checked()?,
        })
    }
}

fn now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |since| since.as_secs() as i64)
}

impl Db {
    /// Every space, of any profile, by position.
    pub fn list_spaces(&self) -> Result<Vec<SpaceRow>, String> {
        let mut query = self
            .conn
            .prepare(&format!("SELECT {COLUMNS} FROM spaces ORDER BY position"))
            .map_err(sql)?;
        query
            .query_map([], row)
            .and_then(|rows| rows.collect())
            .map_err(sql)
    }

    /// Adds a space after every other, and its profile too if the database
    /// has not met it.
    pub fn create_space(&self, profile: &str, space: NewSpace) -> Result<SpaceRow, String> {
        let space = space.checked()?;
        let transaction = self.conn.unchecked_transaction().map_err(sql)?;
        let id = insert(&transaction, profile, &space)?;
        transaction.commit().map_err(sql)?;
        Ok(SpaceRow {
            id,
            profile: profile.to_owned(),
            name: space.name,
            icon: space.icon,
            theme: space.theme,
        })
    }

    pub fn update_space(&self, id: SpaceId, change: SpaceChange) -> Result<SpaceRow, String> {
        let name = change.name.as_deref().map(checked_name).transpose()?;
        let icon = change.icon.as_deref().map(checked_icon).transpose()?;
        let json = change
            .theme
            .map(SpaceTheme::checked)
            .transpose()?
            .map(|theme| theme_json(&theme))
            .transpose()?;
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

    /// Moves a space to `index` among every space, the rest keeping their
    /// order; an index past the last puts it last.
    pub fn move_space(&self, id: SpaceId, index: usize) -> Result<(), String> {
        let transaction = self.conn.unchecked_transaction().map_err(sql)?;
        let mut ids: Vec<SpaceId> = transaction
            .prepare("SELECT id FROM spaces ORDER BY position")
            .and_then(|mut query| query.query_map([], |row| row.get(0))?.collect())
            .map_err(sql)?;
        let from = ids
            .iter()
            .position(|&each| each == id)
            .ok_or("That space is gone.")?;
        ids.remove(from);
        ids.insert(index.min(ids.len()), id);
        {
            let mut update = transaction
                .prepare("UPDATE spaces SET position = ?2 WHERE id = ?1")
                .map_err(sql)?;
            for (position, id) in ids.iter().enumerate() {
                update.execute(params![id, position as i64]).map_err(sql)?;
            }
        }
        transaction.commit().map_err(sql)
    }

    /// Deletes a space, unless it is the app's last: a profile can be
    /// without one, but a window of spaces needs one to show.
    pub fn delete_space(&self, id: SpaceId) -> Result<(), String> {
        let transaction = self.conn.unchecked_transaction().map_err(sql)?;
        let exists: Option<i64> = transaction
            .query_row("SELECT 1 FROM spaces WHERE id = ?1", [id], |row| row.get(0))
            .optional()
            .map_err(sql)?;
        if exists.is_none() {
            return Err("That space is gone.".into());
        }
        let count: i64 = transaction
            .query_row("SELECT count(*) FROM spaces", [], |row| row.get(0))
            .map_err(sql)?;
        if count <= 1 {
            return Err("Wren needs at least one space.".into());
        }
        transaction
            .execute("DELETE FROM spaces WHERE id = ?1", [id])
            .map_err(sql)?;
        transaction.commit().map_err(sql)
    }

    /// Whether the app has a space, of any profile.
    pub fn has_spaces(&self) -> Result<bool, String> {
        self.conn
            .query_row("SELECT EXISTS (SELECT 1 FROM spaces)", [], |row| row.get(0))
            .map_err(sql)
    }
}

// Which space was used last: the windows open on a profile's most recent one.
impl Db {
    // Most recently used first; one never used after every used one, then by
    // position.
    const RECENT: &str = "ORDER BY last_used_at IS NULL, last_used_at DESC, position";

    pub fn space(&self, id: SpaceId) -> Result<Option<SpaceRow>, String> {
        self.conn
            .query_row(
                &format!("SELECT {COLUMNS} FROM spaces WHERE id = ?1"),
                [id],
                row,
            )
            .optional()
            .map_err(sql)
    }

    /// Notes that the space is in use now. A space that is gone is no error.
    /// The time is in milliseconds, and never before the last space's, so
    /// two used one after the other keep their order.
    pub fn touch_space(&self, id: SpaceId) -> Result<(), String> {
        self.conn
            .execute(
                "UPDATE spaces SET last_used_at =
                   max(?2, (SELECT coalesce(max(last_used_at), 0) + 1 FROM spaces))
                 WHERE id = ?1",
                params![
                    id,
                    SystemTime::now()
                        .duration_since(UNIX_EPOCH)
                        .map_or(0, |since| since.as_millis() as i64)
                ],
            )
            .map(drop)
            .map_err(sql)
    }

    /// The profile's most recently used space.
    pub fn recent_space(&self, profile: &str) -> Result<Option<SpaceRow>, String> {
        self.conn
            .query_row(
                &format!(
                    "SELECT {COLUMNS} FROM spaces WHERE profile_id = ?1 {} LIMIT 1",
                    Self::RECENT
                ),
                [profile],
                row,
            )
            .optional()
            .map_err(sql)
    }

    /// The most recently used space of every profile's.
    pub fn most_recent_space(&self) -> Result<Option<SpaceRow>, String> {
        self.conn
            .query_row(
                &format!("SELECT {COLUMNS} FROM spaces {} LIMIT 1", Self::RECENT),
                [],
                row,
            )
            .optional()
            .map_err(sql)
    }
}

fn insert(
    transaction: &rusqlite::Transaction,
    profile: &str,
    space: &NewSpace,
) -> Result<SpaceId, String> {
    transaction
        .execute("INSERT OR IGNORE INTO profiles (id) VALUES (?1)", [profile])
        .map_err(sql)?;
    transaction
        .execute(
            "INSERT INTO spaces (profile_id, name, icon, theme, position, created_at)
             VALUES (?1, ?2, ?3, ?4,
                     (SELECT coalesce(max(position) + 1, 0) FROM spaces), ?5)",
            params![
                profile,
                space.name,
                space.icon,
                theme_json(&space.theme)?,
                now()
            ],
        )
        .map_err(sql)?;
    Ok(transaction.last_insert_rowid())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::test_db as db;

    fn add(db: &Db, profile: &str, name: &str) -> SpaceId {
        let space = NewSpace {
            name: name.into(),
            icon: "lucide:orbit".into(),
            theme: SpaceTheme::default_for("#ffffff"),
        };
        db.create_space(profile, space).unwrap().id
    }

    fn recent(db: &Db, profile: &str) -> Option<SpaceId> {
        db.recent_space(profile).unwrap().map(|space| space.id)
    }

    #[test]
    fn unused_spaces_come_by_position() {
        let db = db();
        let first = add(&db, "a", "First");
        add(&db, "a", "Second");
        assert_eq!(recent(&db, "a"), Some(first));
    }

    #[test]
    fn the_last_touched_is_the_recent_one() {
        let db = db();
        let first = add(&db, "a", "First");
        let second = add(&db, "a", "Second");
        let other = add(&db, "b", "Other");
        db.touch_space(second).unwrap();
        assert_eq!(recent(&db, "a"), Some(second));
        // Right after, most likely within the same millisecond.
        db.touch_space(first).unwrap();
        assert_eq!(recent(&db, "a"), Some(first));
        db.touch_space(other).unwrap();
        assert_eq!(recent(&db, "a"), Some(first));
        assert_eq!(
            db.most_recent_space().unwrap().map(|space| space.id),
            Some(other)
        );
    }

    #[test]
    fn an_unknown_profile_has_none() {
        let db = db();
        add(&db, "a", "First");
        assert_eq!(recent(&db, "b"), None);
        db.touch_space(12345).unwrap();
    }

    fn order(db: &Db) -> Vec<SpaceId> {
        db.list_spaces()
            .unwrap()
            .into_iter()
            .map(|space| space.id)
            .collect()
    }

    #[test]
    fn a_space_moves_past_another_profiles() {
        let db = db();
        let first = add(&db, "a", "First");
        let second = add(&db, "a", "Second");
        let other = add(&db, "b", "Other");
        assert_eq!(order(&db), vec![first, second, other]);
        db.move_space(other, 0).unwrap();
        assert_eq!(order(&db), vec![other, first, second]);
        db.move_space(first, 99).unwrap();
        assert_eq!(order(&db), vec![other, second, first]);
        db.move_space(first, 1).unwrap();
        assert_eq!(order(&db), vec![other, first, second]);
        assert!(db.move_space(other + 1, 0).is_err());
    }

    #[test]
    fn a_space_is_found_by_id() {
        let db = db();
        let id = add(&db, "a", "First");
        assert_eq!(
            db.space(id).unwrap().map(|space| space.name),
            Some("First".into())
        );
        assert!(db.space(id + 1).unwrap().is_none());
    }
}
