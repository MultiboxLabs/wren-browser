// The database's side of the profiles Chromium keeps: their avatar colours,
// and a first space for each of them, which the user can delete.

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

    /// Brings the database in step with the profiles Chromium lists: one
    /// that was listed the last time and is not now is forgotten; with
    /// `fill`, one it has not met gets a default space, and with no space
    /// left in the app, the first listed gets one, so a window always has a
    /// space to show. A profile whose spaces the user deleted stays without
    /// one. Whether anything changed.
    ///
    /// A profile that was never listed is never forgotten, so a list that is
    /// empty because it is not loaded yet deletes nothing.
    pub fn sync_profiles(&self, listed: &[ProfileListEntry], fill: bool) -> bool {
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
        if fill {
            changed |= self.fill(listed);
        }
        changed
    }

    // Gives each profile not met yet its first space, and the first profile
    // one if the app has none. Whether it gave any.
    fn fill(&self, listed: &[ProfileListEntry]) -> bool {
        let mut given = false;
        for profile in listed {
            match self.add_profile(&profile.id, default_space(profile)) {
                Ok(added) => given |= added,
                Err(error) => eprintln!("Wren could not give a profile a space: {error}"),
            }
        }
        let Some(first) = listed.first() else {
            return given;
        };
        match self.has_spaces() {
            Ok(true) => {}
            Ok(false) => match self.create_space(&first.id, default_space(first)) {
                Ok(_) => given = true,
                Err(error) => eprintln!("Wren could not give a profile a space: {error}"),
            },
            Err(error) => eprintln!("Wren could not read the spaces: {error}"),
        }
        given
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::SpaceId;
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
        db.add_profile("x", default_space(&entry("x", "Unlisted")))
            .unwrap();
        assert!(!db.sync_profiles(&[], true));
        assert_eq!(db.list_spaces().unwrap().len(), 1);
    }

    #[test]
    fn a_profile_can_go_without_a_space_but_the_app_cannot() {
        let db = db();
        let both = [entry("a", "Alpha"), entry("b", "Beta")];
        db.sync_profiles(&both, true);
        let spaces = db.list_spaces().unwrap();
        let space = NewSpace {
            name: " Work ".into(),
            icon: "🛠".into(),
            theme: SpaceTheme::default_for("#0a84ff"),
        };
        assert_eq!(db.create_space("a", space).unwrap().name, "Work");
        // "b"'s only space goes, and a sync does not give it another.
        db.delete_space(spaces[1].id).unwrap();
        assert!(!db.sync_profiles(&both, true));
        assert!(db.recent_space("b").unwrap().is_none());
        // The app's last space stays.
        let left: Vec<SpaceId> = db.list_spaces().unwrap().iter().map(|s| s.id).collect();
        db.delete_space(left[0]).unwrap();
        assert!(db.delete_space(left[1]).is_err());
    }

    #[test]
    fn with_no_space_left_the_first_profile_gets_one() {
        let db = db();
        db.sync_profiles(&[entry("a", "Alpha"), entry("b", "Beta")], true);
        let b = db.recent_space("b").unwrap().unwrap().id;
        db.delete_space(b).unwrap();
        // "a" goes, with the app's last space.
        assert!(db.sync_profiles(&[entry("b", "Beta")], true));
        assert_eq!(db.recent_space("b").unwrap().unwrap().name, "Beta");
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
