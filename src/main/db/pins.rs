// The pin queries. A pin is a tab, a split or a folder the user keeps: among
// a profile's favourites, or among a space's pins, at the top or in a folder.
// It goes with its profile or its space, and a folder's go with it.

use std::collections::HashMap;

use rusqlite::{OptionalExtension, Row, Transaction, params};

use super::{Db, SpaceId, sql};

/// A pin's ID, its row's.
pub type PinId = i64;

/// Where a pin is.
#[derive(Clone, Debug, PartialEq)]
pub enum PinPlace {
    /// Among a profile's favourites, which every space of it shows.
    Favorites { profile: String },
    /// Among a space's pins: at the top, or in a folder of them.
    Space {
        space: SpaceId,
        parent: Option<PinId>,
    },
}

/// A page a pin opens on, as it was when last seen.
#[derive(Clone, Debug, PartialEq)]
pub struct PinPage {
    pub url: String,
    pub title: String,
    /// PNG at 2x, as `BrowserTab::favicon_png` gives it.
    pub favicon: Option<Vec<u8>>,
}

/// How a split pin shows its two pages.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum PinLayout {
    SideBySide,
    Stacked,
}

#[derive(Clone, Debug, PartialEq)]
pub enum PinKind {
    Tab(PinPage),
    Split {
        first: PinPage,
        second: PinPage,
        layout: PinLayout,
        /// The first page's share, between 0 and 1.
        ratio: f64,
    },
    Folder {
        open: bool,
        items: Vec<PinRow>,
    },
}

/// A pin as it is kept, with what is in it if it is a folder.
#[derive(Clone, Debug, PartialEq)]
pub struct PinRow {
    pub id: PinId,
    /// The user's name for it; a folder always has one.
    pub name: Option<String>,
    pub kind: PinKind,
}

/// A pin to make.
#[derive(Clone, Debug)]
pub enum NewPin {
    Tab(PinPage),
    Split {
        first: PinPage,
        second: PinPage,
        layout: PinLayout,
        ratio: f64,
    },
    Folder {
        name: String,
    },
}

impl PinLayout {
    fn text(self) -> &'static str {
        match self {
            PinLayout::SideBySide => "side-by-side",
            PinLayout::Stacked => "stacked",
        }
    }

    fn parse(text: Option<&str>) -> PinLayout {
        match text {
            Some("stacked") => PinLayout::Stacked,
            _ => PinLayout::SideBySide,
        }
    }
}

// A pin's row, before its pages and what is in it are put with it.
struct Kept {
    id: PinId,
    parent: Option<PinId>,
    kind: String,
    name: Option<String>,
    open: bool,
    layout: Option<String>,
    ratio: Option<f64>,
}

const COLUMNS: &str = "id, parent_id, kind, name, open, layout, ratio";

fn kept(row: &Row) -> rusqlite::Result<Kept> {
    Ok(Kept {
        id: row.get(0)?,
        parent: row.get(1)?,
        kind: row.get(2)?,
        name: row.get(3)?,
        open: row.get(4)?,
        layout: row.get(5)?,
        ratio: row.get(6)?,
    })
}

// A name as it is kept: trimmed, and none if that leaves nothing.
fn trimmed(name: &str) -> Option<String> {
    Some(name.trim().to_owned()).filter(|name| !name.is_empty())
}

fn now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |since| since.as_secs() as i64)
}

impl Db {
    /// A profile's favourites, in order.
    pub fn favorites(&self, profile: &str) -> Result<Vec<PinRow>, String> {
        self.pin_tree("profile_id = ?1 AND space_id IS NULL", profile)
    }

    /// A space's pins, at the top, in order, each folder with what is in it.
    pub fn space_pins(&self, space: SpaceId) -> Result<Vec<PinRow>, String> {
        self.pin_tree("space_id = ?1", space)
    }

    // The pins `filter` picks, as a tree.
    fn pin_tree(&self, filter: &str, value: impl rusqlite::ToSql) -> Result<Vec<PinRow>, String> {
        let rows: Vec<Kept> = self
            .conn
            .prepare(&format!(
                "SELECT {COLUMNS} FROM pins WHERE {filter} ORDER BY position"
            ))
            .and_then(|mut query| query.query_map([&value], kept)?.collect())
            .map_err(sql)?;
        let mut pages: HashMap<PinId, Vec<PinPage>> = HashMap::new();
        let mut query = self
            .conn
            .prepare(&format!(
                "SELECT pin_id, url, title, favicon FROM pin_pages
                 WHERE pin_id IN (SELECT id FROM pins WHERE {filter}) ORDER BY pin_id, side"
            ))
            .map_err(sql)?;
        let found = query
            .query_map([&value], |row| {
                let page = PinPage {
                    url: row.get(1)?,
                    title: row.get(2)?,
                    favicon: row.get(3)?,
                };
                Ok((row.get::<_, PinId>(0)?, page))
            })
            .map_err(sql)?;
        for each in found {
            let (id, page) = each.map_err(sql)?;
            pages.entry(id).or_default().push(page);
        }
        Ok(build(&rows, None, &mut pages))
    }

    /// Makes a pin in `place`, at `index` among the pins there (None, or one
    /// past the last: last), and answers its ID.
    pub fn create_pin(
        &self,
        place: &PinPlace,
        index: Option<usize>,
        pin: NewPin,
    ) -> Result<PinId, String> {
        let transaction = self.conn.unchecked_transaction().map_err(sql)?;
        let (profile, space, parent) = resolve(&transaction, place)?;
        let (kind, name, layout, ratio, pages) = match pin {
            NewPin::Tab(page) => ("tab", None, None, None, vec![page]),
            NewPin::Split {
                first,
                second,
                layout,
                ratio,
            } => (
                "split",
                None,
                Some(layout.text()),
                Some(ratio.clamp(0.05, 0.95)),
                vec![first, second],
            ),
            NewPin::Folder { name } => {
                if space.is_none() {
                    return Err("A folder can only be among a space's pins.".into());
                }
                let name = trimmed(&name).ok_or("A folder needs a name.")?;
                ("folder", Some(name), None, None, Vec::new())
            }
        };
        let count = siblings(&transaction, &profile, space, parent)?.len();
        let position = index.unwrap_or(count).min(count) as i64;
        transaction
            .execute(
                "UPDATE pins SET position = position + 1
                 WHERE profile_id = ?1 AND space_id IS ?2 AND parent_id IS ?3 AND position >= ?4",
                params![profile, space, parent, position],
            )
            .map_err(sql)?;
        transaction
            .execute(
                "INSERT INTO pins (profile_id, space_id, parent_id, kind, name, layout, ratio,
                                   position, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
                params![
                    profile,
                    space,
                    parent,
                    kind,
                    name,
                    layout,
                    ratio,
                    position,
                    now()
                ],
            )
            .map_err(sql)?;
        let id = transaction.last_insert_rowid();
        for (side, page) in pages.iter().enumerate() {
            transaction
                .execute(
                    "INSERT INTO pin_pages (pin_id, side, url, title, favicon)
                     VALUES (?1, ?2, ?3, ?4, ?5)",
                    params![id, side as i64, page.url, page.title, page.favicon],
                )
                .map_err(sql)?;
        }
        transaction.commit().map_err(sql)?;
        Ok(id)
    }

    /// Names a pin, or, with no name, lets it go by its page's title again.
    /// A folder keeps a name.
    pub fn rename_pin(&self, id: PinId, name: Option<&str>) -> Result<(), String> {
        let name = name.and_then(trimmed);
        let kind = self.pin_kind(id)?;
        if kind == "folder" && name.is_none() {
            return Err("A folder needs a name.".into());
        }
        self.conn
            .execute("UPDATE pins SET name = ?2 WHERE id = ?1", params![id, name])
            .map(drop)
            .map_err(sql)
    }

    /// Opens a folder, or closes it.
    pub fn set_folder_open(&self, id: PinId, open: bool) -> Result<(), String> {
        if self.pin_kind(id)? != "folder" {
            return Err("That pin is not a folder.".into());
        }
        self.conn
            .execute("UPDATE pins SET open = ?2 WHERE id = ?1", params![id, open])
            .map(drop)
            .map_err(sql)
    }

    /// A pin by its ID, with its profile and, for a space's, its space. A
    /// folder comes without what is in it.
    pub fn pin(&self, id: PinId) -> Result<Option<(String, Option<SpaceId>, PinRow)>, String> {
        let found = self
            .conn
            .query_row(
                &format!("SELECT {COLUMNS}, profile_id, space_id FROM pins WHERE id = ?1"),
                [id],
                |row| Ok((kept(row)?, row.get::<_, String>(7)?, row.get(8)?)),
            )
            .optional()
            .map_err(sql)?;
        let Some((mut row, profile, space)) = found else {
            return Ok(None);
        };
        // Built as the one pin at the top.
        row.parent = None;
        let mut pages = HashMap::new();
        let mut query = self
            .conn
            .prepare("SELECT url, title, favicon FROM pin_pages WHERE pin_id = ?1 ORDER BY side")
            .map_err(sql)?;
        let kept_pages = query
            .query_map([id], |row| {
                Ok(PinPage {
                    url: row.get(0)?,
                    title: row.get(1)?,
                    favicon: row.get(2)?,
                })
            })
            .and_then(|rows| rows.collect::<rusqlite::Result<Vec<_>>>())
            .map_err(sql)?;
        pages.insert(id, kept_pages);
        let built = build(&[row], None, &mut pages).pop();
        Ok(built.map(|pin| (profile, space, pin)))
    }

    /// Keeps the title and favicon a pin's page shows now, its address
    /// unchanged. Answers whether they were not kept so already.
    pub fn set_pin_look(
        &self,
        id: PinId,
        side: usize,
        title: &str,
        favicon: Option<&[u8]>,
    ) -> Result<bool, String> {
        self.conn
            .execute(
                "UPDATE pin_pages SET title = ?3, favicon = ?4
                 WHERE pin_id = ?1 AND side = ?2 AND (title IS NOT ?3 OR favicon IS NOT ?4)",
                params![id, side as i64, title, favicon],
            )
            .map(|changed| changed > 0)
            .map_err(sql)
    }

    /// Makes a split pin a tab pin of its page on `side` (0 or 1), as its
    /// tabs stop being a split.
    pub fn split_to_tab(&self, id: PinId, side: usize) -> Result<(), String> {
        let transaction = self.conn.unchecked_transaction().map_err(sql)?;
        let changed = transaction
            .execute(
                "UPDATE pins SET kind = 'tab', layout = NULL, ratio = NULL
                 WHERE id = ?1 AND kind = 'split'",
                [id],
            )
            .map_err(sql)?;
        if changed == 0 {
            return Err("That pin is not a split.".into());
        }
        transaction
            .execute(
                "DELETE FROM pin_pages WHERE pin_id = ?1 AND side != ?2",
                params![id, side as i64],
            )
            .map_err(sql)?;
        transaction
            .execute("UPDATE pin_pages SET side = 0 WHERE pin_id = ?1", [id])
            .map_err(sql)?;
        transaction.commit().map_err(sql)
    }

    /// Deletes a pin, and, for a folder, everything in it; the pins after it
    /// close the gap. Answers the IDs of every pin deleted.
    pub fn delete_pin(&self, id: PinId) -> Result<Vec<PinId>, String> {
        let transaction = self.conn.unchecked_transaction().map_err(sql)?;
        let deleted: Vec<PinId> = transaction
            .prepare(
                "WITH RECURSIVE gone(id) AS (
                   SELECT id FROM pins WHERE id = ?1
                   UNION ALL SELECT pins.id FROM pins JOIN gone ON pins.parent_id = gone.id
                 ) SELECT id FROM gone",
            )
            .and_then(|mut query| query.query_map([id], |row| row.get(0))?.collect())
            .map_err(sql)?;
        let (profile, space, parent, position): (String, Option<SpaceId>, Option<PinId>, i64) =
            transaction
                .query_row(
                    "SELECT profile_id, space_id, parent_id, position FROM pins WHERE id = ?1",
                    [id],
                    |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
                )
                .optional()
                .map_err(sql)?
                .ok_or("That pin is gone.")?;
        transaction
            .execute("DELETE FROM pins WHERE id = ?1", [id])
            .map_err(sql)?;
        transaction
            .execute(
                "UPDATE pins SET position = position - 1
                 WHERE profile_id = ?1 AND space_id IS ?2 AND parent_id IS ?3 AND position > ?4",
                params![profile, space, parent, position],
            )
            .map_err(sql)?;
        transaction.commit().map_err(sql)?;
        Ok(deleted)
    }

    fn pin_kind(&self, id: PinId) -> Result<String, String> {
        self.conn
            .query_row("SELECT kind FROM pins WHERE id = ?1", [id], |row| {
                row.get(0)
            })
            .optional()
            .map_err(sql)?
            .ok_or_else(|| "That pin is gone.".into())
    }
}

// The pins under `parent`, each with its pages and what is in it.
fn build(
    rows: &[Kept],
    parent: Option<PinId>,
    pages: &mut HashMap<PinId, Vec<PinPage>>,
) -> Vec<PinRow> {
    rows.iter()
        .filter(|row| row.parent == parent)
        .filter_map(|row| {
            let kind = match row.kind.as_str() {
                "folder" => PinKind::Folder {
                    open: row.open,
                    items: build(rows, Some(row.id), pages),
                },
                "split" => {
                    let mut sides = pages.remove(&row.id).unwrap_or_default().into_iter();
                    // A split without both its pages can't be opened: it is passed by.
                    let (first, second) = (sides.next()?, sides.next()?);
                    PinKind::Split {
                        first,
                        second,
                        layout: PinLayout::parse(row.layout.as_deref()),
                        ratio: row.ratio.unwrap_or(0.5),
                    }
                }
                _ => PinKind::Tab(pages.remove(&row.id)?.into_iter().next()?),
            };
            Some(PinRow {
                id: row.id,
                name: row.name.clone(),
                kind,
            })
        })
        .collect()
}

// A place's profile, space and folder, or why a pin can't go there: a space
// or a folder that is gone, or a parent that is not a folder of the space.
fn resolve(
    transaction: &Transaction,
    place: &PinPlace,
) -> Result<(String, Option<SpaceId>, Option<PinId>), String> {
    match place {
        PinPlace::Favorites { profile } => {
            transaction
                .execute("INSERT OR IGNORE INTO profiles (id) VALUES (?1)", [profile])
                .map_err(sql)?;
            Ok((profile.clone(), None, None))
        }
        PinPlace::Space { space, parent } => {
            let profile: String = transaction
                .query_row(
                    "SELECT profile_id FROM spaces WHERE id = ?1",
                    [space],
                    |row| row.get(0),
                )
                .optional()
                .map_err(sql)?
                .ok_or("That space is gone.")?;
            if let Some(parent) = parent {
                let folder: Option<(String, Option<SpaceId>)> = transaction
                    .query_row(
                        "SELECT kind, space_id FROM pins WHERE id = ?1",
                        [parent],
                        |row| Ok((row.get(0)?, row.get(1)?)),
                    )
                    .optional()
                    .map_err(sql)?;
                if folder != Some(("folder".into(), Some(*space))) {
                    return Err("That folder is gone.".into());
                }
            }
            Ok((profile, Some(*space), *parent))
        }
    }
}

// The IDs of the pins of one place, in order.
fn siblings(
    transaction: &Transaction,
    profile: &str,
    space: Option<SpaceId>,
    parent: Option<PinId>,
) -> Result<Vec<PinId>, String> {
    transaction
        .prepare(
            "SELECT id FROM pins
             WHERE profile_id = ?1 AND space_id IS ?2 AND parent_id IS ?3 ORDER BY position",
        )
        .and_then(|mut query| {
            query
                .query_map(params![profile, space, parent], |row| row.get(0))?
                .collect()
        })
        .map_err(sql)
}

#[cfg(test)]
mod tests;
