// Spaces and pins brought over from another browser (import/land/): each
// lot in one transaction, so a failure leaves nothing half-made. What the
// profile has already is not made again: a space of the same name, with its
// pins, a favourite of the same address, and a page its space has pinned.

use std::collections::HashSet;

use wren::ProfileListEntry;

use super::pins::{NewPin, PinKind, PinPlace, PinRow, insert_pin};
use super::profiles::default_space;
use super::spaces::{NewSpace, SpaceId, insert};
use super::{Db, sql};

/// A space to make, with its pins.
pub struct ImportedSpace {
    pub space: NewSpace,
    pub pins: Vec<ImportedPin>,
}

pub enum ImportedPin {
    Pin(NewPin),
    Folder {
        name: String,
        pins: Vec<ImportedPin>,
    },
}

/// What was made, and what was left as the profile had it already.
#[derive(Debug, Default, PartialEq)]
pub struct Added {
    pub spaces: usize,
    pub pins: usize,
    pub skipped_spaces: usize,
}

impl Db {
    pub fn add_spaces(
        &self,
        profile: &str,
        spaces: Vec<ImportedSpace>,
        favorites: Vec<NewPin>,
    ) -> Result<Added, String> {
        let names: HashSet<String> = self
            .list_spaces()?
            .into_iter()
            .filter(|space| space.profile == profile)
            .map(|space| space.name.to_lowercase())
            .collect();
        let mut favorite_urls: HashSet<String> = self
            .favorites(profile)?
            .into_iter()
            .filter_map(|pin| match pin.kind {
                PinKind::Tab(page) => Some(page.url),
                _ => None,
            })
            .collect();
        let transaction = self.conn.unchecked_transaction().map_err(sql)?;
        let mut added = Added::default();
        for imported in spaces {
            let space = imported.space.checked()?;
            if names.contains(&space.name.to_lowercase()) {
                added.skipped_spaces += 1;
                continue;
            }
            let id = insert(&transaction, profile, &space)?;
            added.spaces += 1;
            added.pins += insert_pins(&transaction, id, None, imported.pins)?;
        }
        let place = PinPlace::Favorites {
            profile: profile.to_owned(),
        };
        for favorite in favorites {
            if let NewPin::Tab(page) = &favorite
                && !favorite_urls.insert(page.url.clone())
            {
                continue;
            }
            insert_pin(&transaction, &place, None, favorite)?;
            added.pins += 1;
        }
        transaction.commit().map_err(sql)?;
        Ok(added)
    }

    /// Adds `pins` after `space`'s own, less any page the space has pinned
    /// already, and any folder that leaves empty; answers how many tabs and
    /// splits it made.
    pub fn add_pins(&self, space: SpaceId, pins: Vec<ImportedPin>) -> Result<usize, String> {
        let mut pinned = HashSet::new();
        pages_of(&self.space_pins(space)?, &mut pinned);
        let pins = unpinned(pins, &mut pinned);
        let transaction = self.conn.unchecked_transaction().map_err(sql)?;
        let made = insert_pins(&transaction, space, None, pins)?;
        transaction.commit().map_err(sql)?;
        Ok(made)
    }

    /// The space pins brought over to `profile` go in: the one it used last,
    /// or, if it has none, a new one, as the app gives a profile.
    pub fn space_for_imports(&self, profile: &ProfileListEntry) -> Result<SpaceId, String> {
        match self.recent_space(&profile.id)? {
            Some(space) => Ok(space.id),
            None => Ok(self.create_space(&profile.id, default_space(profile))?.id),
        }
    }
}

// Every page `rows` pin, in folders and splits too.
fn pages_of(rows: &[PinRow], pages: &mut HashSet<String>) {
    for row in rows {
        match &row.kind {
            PinKind::Tab(page) => {
                pages.insert(page.url.clone());
            }
            PinKind::Split { first, second, .. } => {
                pages.insert(first.url.clone());
                pages.insert(second.url.clone());
            }
            PinKind::Folder { items, .. } => pages_of(items, pages),
        }
    }
}

// `pins`, less any tab of a page in `pinned`, which takes each it keeps, and
// any folder that leaves empty.
fn unpinned(pins: Vec<ImportedPin>, pinned: &mut HashSet<String>) -> Vec<ImportedPin> {
    pins.into_iter()
        .filter_map(|pin| match pin {
            ImportedPin::Pin(NewPin::Tab(page)) => pinned
                .insert(page.url.clone())
                .then_some(ImportedPin::Pin(NewPin::Tab(page))),
            ImportedPin::Folder { name, pins } => {
                let pins = unpinned(pins, pinned);
                (!pins.is_empty()).then_some(ImportedPin::Folder { name, pins })
            }
            other => Some(other),
        })
        .collect()
}

// Makes `pins` in space `space`, in folder `parent` or at the top, last;
// answers how many tabs and splits it made.
fn insert_pins(
    transaction: &rusqlite::Transaction,
    space: i64,
    parent: Option<i64>,
    pins: Vec<ImportedPin>,
) -> Result<usize, String> {
    let place = PinPlace::Space { space, parent };
    let mut made = 0;
    for pin in pins {
        match pin {
            ImportedPin::Pin(pin) => {
                insert_pin(transaction, &place, None, pin)?;
                made += 1;
            }
            ImportedPin::Folder { name, pins } => {
                let folder = insert_pin(transaction, &place, None, NewPin::Folder { name })?;
                made += insert_pins(transaction, space, Some(folder), pins)?;
            }
        }
    }
    Ok(made)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::PinPage;
    use crate::db::test_db as db;
    use crate::db::theme::SpaceTheme;

    fn tab(url: &str) -> NewPin {
        NewPin::Tab(PinPage {
            url: url.into(),
            title: url.into(),
            favicon: None,
        })
    }

    fn space(name: &str, pins: Vec<ImportedPin>) -> ImportedSpace {
        ImportedSpace {
            space: NewSpace {
                name: name.into(),
                icon: "🏠".into(),
                theme: SpaceTheme::default_for("#7a81ff"),
            },
            pins,
        }
    }

    #[test]
    fn adds_spaces_with_folders_once() {
        let db = db();
        let spaces = || {
            vec![space(
                "Home",
                vec![
                    ImportedPin::Pin(tab("https://a.example/")),
                    ImportedPin::Folder {
                        name: "Docs".into(),
                        pins: vec![ImportedPin::Pin(tab("https://b.example/"))],
                    },
                ],
            )]
        };
        let added = db
            .add_spaces("Default", spaces(), vec![tab("https://c.example/")])
            .unwrap();
        assert_eq!(
            added,
            Added {
                spaces: 1,
                pins: 3,
                skipped_spaces: 0
            }
        );
        let home = db.list_spaces().unwrap().pop().unwrap();
        let pins = db.space_pins(home.id).unwrap();
        assert!(matches!(&pins[1].kind, PinKind::Folder { items, .. } if items.len() == 1));
        // Again: nothing is doubled.
        let again = db
            .add_spaces("Default", spaces(), vec![tab("https://c.example/")])
            .unwrap();
        assert_eq!(
            again,
            Added {
                spaces: 0,
                pins: 0,
                skipped_spaces: 1
            }
        );
        assert_eq!(db.favorites("Default").unwrap().len(), 1);
    }

    #[test]
    fn adds_pins_a_space_has_not_pinned() {
        let db = db();
        let space = db
            .create_space("Default", space("Home", Vec::new()).space)
            .unwrap()
            .id;
        let pins = || {
            vec![
                ImportedPin::Pin(tab("https://a.example/")),
                ImportedPin::Folder {
                    name: "Other Bookmarks".into(),
                    pins: vec![
                        ImportedPin::Pin(tab("https://b.example/")),
                        ImportedPin::Pin(tab("https://a.example/")),
                    ],
                },
            ]
        };
        assert_eq!(db.add_pins(space, pins()).unwrap(), 2);
        let made = db.space_pins(space).unwrap();
        assert!(matches!(&made[1].kind, PinKind::Folder { items, .. } if items.len() == 1));
        // Again: every page is pinned, so nothing, not even the folder.
        assert_eq!(db.add_pins(space, pins()).unwrap(), 0);
        assert_eq!(db.space_pins(space).unwrap().len(), 2);
    }
}
