// The database's side of the profiles Chromium keeps: their avatar colours,
// and their spaces, of which a profile can have none. The app always has
// one, for a window of spaces to show.

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

/// The space a profile is given when the app has none: named for it, in its
/// colour.
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
    /// Adds a profile the database has not met, with no space. Whether it
    /// added it.
    pub fn add_profile(&self, id: &str) -> Result<bool, String> {
        self.conn
            .execute("INSERT OR IGNORE INTO profiles (id) VALUES (?1)", [id])
            .map(|added| added > 0)
            .map_err(sql)
    }

    /// Deletes the profile, and with it its spaces.
    pub fn forget_profile(&self, id: &str) -> Result<(), String> {
        self.conn
            .execute("DELETE FROM profiles WHERE id = ?1", [id])
            .map_err(sql)?;
        self.listed.borrow_mut().remove(id);
        Ok(())
    }

    /// Brings the database in step with the profiles Chromium lists: one
    /// that was listed the last time and is not now is forgotten, and one it
    /// has not met is added, with no space. With no space left in the app,
    /// the first listed gets one, so a window always has a space to show.
    /// Whether anything changed.
    ///
    /// A profile that was never listed is never forgotten, so a list that is
    /// empty because it is not loaded yet deletes nothing.
    pub fn sync_profiles(&self, listed: &[ProfileListEntry]) -> bool {
        let mut changed = false;
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
        for profile in listed {
            match self.add_profile(&profile.id) {
                Ok(added) => changed |= added,
                Err(error) => eprintln!("Wren could not keep a profile: {error}"),
            }
        }
        changed | self.keep_a_space(listed.first())
    }

    // Gives `first`, the first profile listed, a space if the app has none
    // left. Whether it gave one.
    fn keep_a_space(&self, first: Option<&ProfileListEntry>) -> bool {
        let Some(first) = first else {
            return false;
        };
        match self.has_spaces() {
            Ok(true) => false,
            Ok(false) => match self.create_space(&first.id, default_space(first)) {
                Ok(_) => true,
                Err(error) => {
                    eprintln!("Wren could not give a profile a space: {error}");
                    false
                }
            },
            Err(error) => {
                eprintln!("Wren could not read the spaces: {error}");
                false
            }
        }
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
    fn adds_profiles_without_spaces_and_forgets_them() {
        let db = db();
        let both = [entry("a", "Alpha"), entry("b", "Beta")];
        // The app has no space: the first profile is given one, alone.
        assert!(db.sync_profiles(&both));
        assert!(!db.sync_profiles(&both));
        let spaces = db.list_spaces().unwrap();
        assert_eq!(spaces.len(), 1);
        assert_eq!(spaces[0].profile, "a");
        assert_eq!(spaces[0].name, "Alpha");

        // A new profile has none, and "a" is forgotten, with the app's
        // last space: "c", first now, is given one.
        assert!(db.sync_profiles(&[entry("c", "Gamma"), entry("b", "Beta")]));
        let spaces = db.list_spaces().unwrap();
        assert_eq!(spaces.len(), 1);
        assert_eq!(spaces[0].profile, "c");
    }

    #[test]
    fn an_empty_list_forgets_only_what_was_listed() {
        let db = db();
        db.create_space("x", default_space(&entry("x", "Unlisted")))
            .unwrap();
        assert!(!db.sync_profiles(&[]));
        assert_eq!(db.list_spaces().unwrap().len(), 1);
    }

    #[test]
    fn a_profile_can_go_without_a_space_but_the_app_cannot() {
        let db = db();
        let both = [entry("a", "Alpha"), entry("b", "Beta")];
        db.sync_profiles(&both);
        let alpha = db.recent_space("a").unwrap().unwrap().id;
        let space = NewSpace {
            name: " Work ".into(),
            icon: "🛠".into(),
            theme: SpaceTheme::default_for("#0a84ff"),
        };
        let work = db.create_space("b", space).unwrap();
        assert_eq!(work.name, "Work");
        // "a"'s only space goes, and a sync does not give it another.
        db.delete_space(alpha).unwrap();
        assert!(!db.sync_profiles(&both));
        assert!(db.recent_space("a").unwrap().is_none());
        // The app's last space stays.
        assert!(db.delete_space(work.id).is_err());
    }

    #[test]
    fn spaces_go_with_their_profile() {
        let db = db();
        db.sync_profiles(&[entry("a", "Alpha")]);
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
