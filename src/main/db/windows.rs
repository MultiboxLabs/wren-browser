// The window queries: the windows open at quit, each with its key, its place
// on screen, its current space, and the spaces it has a Browser for, or the
// profile it shows, so it comes back as it was (session.rs).

use rusqlite::{Row, params};

use super::{Db, SpaceId, sql};

/// A window's place on screen, in AppKit's screen coordinates.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct WindowFrame {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

/// A window as it was kept.
#[derive(Clone, Debug, PartialEq)]
pub struct SavedWindow {
    pub key: String,
    /// None if it had none, or that space was deleted.
    pub space: Option<SpaceId>,
    /// The spaces it had a Browser for.
    pub spaces: Vec<SpaceId>,
    /// The profile it shows, if it shows one rather than spaces.
    pub profile: Option<String>,
    pub frame: Option<WindowFrame>,
}

fn frame(row: &Row, from: usize) -> rusqlite::Result<Option<WindowFrame>> {
    let read = |at| row.get::<_, Option<f64>>(from + at);
    Ok(match (read(0)?, read(1)?, read(2)?, read(3)?) {
        (Some(x), Some(y), Some(width), Some(height)) => Some(WindowFrame {
            x,
            y,
            width,
            height,
        }),
        _ => None,
    })
}

impl Db {
    /// Keeps a window that has opened, after the others, and answers its
    /// key: random, so a Browser's tag from an earlier launch names no window
    /// of this one by chance.
    pub fn add_window(&self) -> Result<String, String> {
        let key: String = self
            .conn
            .query_row("SELECT lower(hex(randomblob(16)))", [], |row| row.get(0))
            .map_err(sql)?;
        self.conn
            .execute(
                "INSERT INTO windows (id, position)
                 VALUES (?1, (SELECT coalesce(max(position), -1) + 1 FROM windows))",
                [&key],
            )
            .map_err(sql)?;
        Ok(key)
    }

    /// Keeps window `key`'s current space and the spaces it has a Browser
    /// for, or the profile it shows. A space or a profile that is gone is
    /// left out.
    pub fn save_window(
        &self,
        key: &str,
        space: Option<SpaceId>,
        spaces: &[SpaceId],
        profile: Option<&str>,
    ) -> Result<(), String> {
        let transaction = self.conn.unchecked_transaction().map_err(sql)?;
        transaction
            .execute(
                "UPDATE windows SET current_space = (SELECT id FROM spaces WHERE id = ?2),
                   profile_id = (SELECT id FROM profiles WHERE id = ?3)
                 WHERE id = ?1",
                params![key, space, profile],
            )
            .map_err(sql)?;
        transaction
            .execute("DELETE FROM window_spaces WHERE window_id = ?1", [key])
            .map_err(sql)?;
        for space in spaces {
            transaction
                .execute(
                    "INSERT INTO window_spaces (window_id, space_id)
                     SELECT ?1, id FROM spaces WHERE id = ?2
                       AND EXISTS (SELECT 1 FROM windows WHERE id = ?1)",
                    params![key, space],
                )
                .map_err(sql)?;
        }
        transaction.commit().map_err(sql)
    }

    /// Keeps where window `key` is on screen.
    pub fn save_window_frame(&self, key: &str, frame: WindowFrame) -> Result<(), String> {
        self.conn
            .execute(
                "UPDATE windows SET frame_x = ?2, frame_y = ?3, frame_width = ?4, frame_height = ?5
                 WHERE id = ?1",
                params![key, frame.x, frame.y, frame.width, frame.height],
            )
            .map(drop)
            .map_err(sql)
    }

    /// Forgets a window the user closed, which does not come back.
    pub fn forget_window(&self, key: &str) -> Result<(), String> {
        self.conn
            .execute("DELETE FROM windows WHERE id = ?1", [key])
            .map(drop)
            .map_err(sql)
    }

    /// The windows kept, in the order they opened.
    pub fn saved_windows(&self) -> Result<Vec<SavedWindow>, String> {
        let mut windows = self
            .conn
            .prepare(
                "SELECT id, current_space, profile_id, frame_x, frame_y, frame_width, frame_height
                 FROM windows ORDER BY position",
            )
            .map_err(sql)?
            .query_map([], |row| {
                Ok(SavedWindow {
                    key: row.get(0)?,
                    space: row.get(1)?,
                    spaces: Vec::new(),
                    profile: row.get(2)?,
                    frame: frame(row, 3)?,
                })
            })
            .map_err(sql)?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(sql)?;
        let mut spaces = self
            .conn
            .prepare("SELECT space_id FROM window_spaces WHERE window_id = ?1 ORDER BY space_id")
            .map_err(sql)?;
        for window in &mut windows {
            window.spaces = spaces
                .query_map([&window.key], |row| row.get(0))
                .map_err(sql)?
                .collect::<rusqlite::Result<_>>()
                .map_err(sql)?;
        }
        Ok(windows)
    }

    /// The profiles whose Browsers the kept windows wait for: those of the
    /// spaces they have a Browser for, and those they show.
    pub fn saved_window_profiles(&self) -> Result<Vec<String>, String> {
        self.conn
            .prepare(
                "SELECT spaces.profile_id FROM window_spaces
                 JOIN spaces ON spaces.id = window_spaces.space_id
                 UNION SELECT profile_id FROM windows WHERE profile_id IS NOT NULL
                 ORDER BY 1",
            )
            .map_err(sql)?
            .query_map([], |row| row.get(0))
            .map_err(sql)?
            .collect::<rusqlite::Result<_>>()
            .map_err(sql)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::NewSpace;
    use crate::db::test_db as db;
    use crate::db::theme::SpaceTheme;

    fn add_space(db: &Db, profile: &str) -> SpaceId {
        let space = NewSpace {
            name: "Space".into(),
            icon: "lucide:orbit".into(),
            theme: SpaceTheme::default_for("#ffffff"),
        };
        db.create_space(profile, space).unwrap().id
    }

    #[test]
    fn windows_come_back_in_order_with_their_spaces() {
        let db = db();
        let a = add_space(&db, "a");
        let b = add_space(&db, "b");
        let first = db.add_window().unwrap();
        let second = db.add_window().unwrap();
        assert_ne!(first, second);
        db.save_window(&second, Some(b), &[a, b], None).unwrap();
        let frame = WindowFrame {
            x: 10.0,
            y: 20.0,
            width: 800.0,
            height: 600.0,
        };
        db.save_window_frame(&second, frame).unwrap();
        let saved = db.saved_windows().unwrap();
        assert_eq!(saved.len(), 2);
        assert_eq!(saved[0].key, first);
        assert_eq!(saved[0].space, None);
        assert_eq!(saved[0].frame, None);
        assert_eq!(saved[1].space, Some(b));
        assert_eq!(saved[1].spaces, vec![a, b]);
        assert_eq!(saved[1].frame, Some(frame));
        assert_eq!(db.saved_window_profiles().unwrap(), vec!["a", "b"]);
    }

    #[test]
    fn a_deleted_space_and_a_forgotten_window_go() {
        let db = db();
        let a = add_space(&db, "a");
        let b = add_space(&db, "a");
        let key = db.add_window().unwrap();
        db.save_window(&key, Some(a), &[a, b], None).unwrap();
        db.delete_space(a).unwrap();
        let saved = db.saved_windows().unwrap();
        assert_eq!(saved[0].space, None);
        assert_eq!(saved[0].spaces, vec![b]);
        // A space that is gone is left out.
        db.save_window(&key, Some(a), &[a], None).unwrap();
        assert_eq!(db.saved_windows().unwrap()[0].spaces, Vec::<SpaceId>::new());
        db.forget_window(&key).unwrap();
        assert!(db.saved_windows().unwrap().is_empty());
        assert!(db.saved_window_profiles().unwrap().is_empty());
    }

    #[test]
    fn a_window_on_a_profile_comes_back_on_it_and_goes_with_it() {
        let db = db();
        let a = add_space(&db, "a");
        add_space(&db, "b");
        let key = db.add_window().unwrap();
        db.save_window(&key, None, &[], Some("b")).unwrap();
        let saved = db.saved_windows().unwrap();
        assert_eq!(saved[0].profile.as_deref(), Some("b"));
        assert_eq!(saved[0].space, None);
        assert_eq!(db.saved_window_profiles().unwrap(), vec!["b"]);
        // A profile the database has not met is left out.
        db.save_window(&key, None, &[], Some("c")).unwrap();
        assert_eq!(db.saved_windows().unwrap()[0].profile, None);
        db.save_window(&key, Some(a), &[a], None).unwrap();
        db.save_window(&key, None, &[], Some("b")).unwrap();
        assert_eq!(db.saved_window_profiles().unwrap(), vec!["b"]);
        db.forget_profile("b").unwrap();
        assert!(db.saved_windows().unwrap().is_empty());
    }
}
