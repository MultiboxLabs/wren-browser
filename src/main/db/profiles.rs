// The database's side of the profiles Chromium keeps: their avatar colours,
// and a space for each of them.

use wren::ProfileListEntry;

use super::spaces::NewSpace;
use super::theme::SpaceTheme;
use super::{Db, sql};

/// The colours a profile's avatar takes, one by its ID.
const AVATARS: [&str; 7] = [
    "#6f00ff", "#0a84ff", "#30d158", "#ff9f0a", "#bf5af2", "#ff375f", "#64d2ff",
];

/// Chromium keeps no colour for a profile, so its ID chooses one: the same
/// each time, and not shared by every profile. The hash is the page's old one,
/// over UTF-16 code units, so avatars keep the colour they had.
pub fn avatar(id: &str) -> &'static str {
    let hash = id.encode_utf16().fold(0u32, |hash, unit| {
        hash.wrapping_mul(31).wrapping_add(unit.into())
    });
    AVATARS[hash as usize % AVATARS.len()]
}

/// A profile's first space: named for it, in its colour.
fn default_space(profile: &ProfileListEntry) -> NewSpace {
    NewSpace {
        name: match profile.name.trim() {
            "" => "Space".to_owned(),
            name => name.to_owned(),
        },
        icon: "lucide:orbit".to_owned(),
        theme: SpaceTheme::default_for(avatar(&profile.id)),
    }
}

impl Db {
    /// Deletes the profile, and with it its spaces.
    pub fn forget_profile(&self, id: &str) -> Result<(), String> {
        self.conn
            .execute("DELETE FROM profiles WHERE id = ?1", [id])
            .map_err(sql)?;
        self.listed.borrow_mut().remove(id);
        Ok(())
    }

    /// Brings the database in step with the profiles Chromium lists: with
    /// `fill`, each gets a default space if it has none; one that was listed
    /// the last time and is not now is forgotten. Whether anything changed.
    ///
    /// A profile that was never listed is never forgotten, so a list that is
    /// empty because it is not loaded yet deletes nothing.
    pub fn sync_profiles(&self, listed: &[ProfileListEntry], fill: bool) -> bool {
        let mut changed = false;
        if fill {
            for profile in listed {
                match self.ensure_space(&profile.id, default_space(profile)) {
                    Ok(added) => changed |= added,
                    Err(error) => eprintln!("Wren could not give a profile a space: {error}"),
                }
            }
        }
        let gone: Vec<String> = self
            .listed
            .borrow()
            .iter()
            .filter(|id| !listed.iter().any(|profile| &profile.id == *id))
            .cloned()
            .collect();
        for id in gone {
            match self.forget_profile(&id) {
                Ok(()) => changed = true,
                Err(error) => eprintln!("Wren could not forget a profile: {error}"),
            }
        }
        *self.listed.borrow_mut() = listed.iter().map(|profile| profile.id.clone()).collect();
        changed
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::test_db as db;

    fn entry(id: &str, name: &str) -> ProfileListEntry {
        ProfileListEntry {
            id: id.into(),
            name: name.into(),
            avatar: 0,
        }
    }

    #[test]
    fn avatar_keeps_its_colour() {
        // Each from the page's old `avatar`.
        assert_eq!(avatar("Default"), AVATARS[4]);
        assert_eq!(avatar(""), AVATARS[0]);
    }

    #[test]
    fn fills_and_forgets() {
        let db = db();
        let both = [entry("a", "Alpha"), entry("b", "Beta")];
        assert!(db.sync_profiles(&both, true));
        assert!(!db.sync_profiles(&both, true));
        let spaces = db.list_spaces().unwrap();
        assert_eq!(spaces.len(), 2);
        assert_eq!(spaces[0].name, "Alpha");

        // Not filling leaves a new profile without one, and forgets "b".
        assert!(db.sync_profiles(&[entry("a", "Alpha"), entry("c", "Gamma")], false));
        assert_eq!(db.list_spaces().unwrap().len(), 1);
    }

    #[test]
    fn an_empty_list_forgets_only_what_was_listed() {
        let db = db();
        db.ensure_space("x", default_space(&entry("x", "Unlisted")))
            .unwrap();
        assert!(!db.sync_profiles(&[], true));
        assert_eq!(db.list_spaces().unwrap().len(), 1);
    }

    #[test]
    fn the_last_space_stays() {
        let db = db();
        db.sync_profiles(&[entry("a", "Alpha")], true);
        let first = db.list_spaces().unwrap()[0].id;
        assert!(db.delete_space(first).is_err());
        let space = NewSpace {
            name: " Work ".into(),
            icon: "🛠".into(),
            theme: SpaceTheme::default_for("#0a84ff"),
        };
        let second = db.create_space("a", space).unwrap();
        assert_eq!(second.name, "Work");
        db.delete_space(first).unwrap();
        assert!(db.delete_space(second.id).is_err());
    }

    #[test]
    fn spaces_go_with_their_profile() {
        let db = db();
        db.sync_profiles(&[entry("a", "Alpha")], true);
        db.forget_profile("a").unwrap();
        assert!(db.list_spaces().unwrap().is_empty());
    }

    #[test]
    fn icons_are_checked() {
        let db = db();
        let with = |icon: &str| NewSpace {
            name: "S".into(),
            icon: icon.into(),
            theme: SpaceTheme::default_for("#ffffff"),
        };
        assert!(db.create_space("a", with("lucide:orbit")).is_ok());
        assert!(db.create_space("a", with("lucide:Orbit")).is_err());
        assert!(db.create_space("a", with("orbit")).is_err());
        assert!(db.create_space("a", with("")).is_err());
    }
}
