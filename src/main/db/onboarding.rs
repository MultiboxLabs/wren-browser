// What onboarding keeps (onboarding.rs), beside the settings, as what the
// page never sees as one: whether the user has been through it, and the
// theme they chose for their first space until that space is made.

use super::settings::set;
use super::spaces::SpaceChange;
use super::theme::SpaceTheme;
use super::{Db, sql};

const ONBOARDED: &str = "onboarded";
const FIRST_THEME: &str = "firstSpaceTheme";

impl Db {
    /// Whether the user has finished onboarding. An error counts as done, so
    /// a database that can't be read never keeps them from the app.
    pub fn onboarded(&self) -> bool {
        self.setting(ONBOARDED).unwrap_or_else(|error| {
            eprintln!("Wren could not read whether onboarding is done: {error}");
            Some(true)
        }) == Some(true)
    }

    /// Notes that the user has finished onboarding, or, for Reset
    /// Onboarding, that they have not.
    pub fn set_onboarded(&self, onboarded: bool) -> Result<(), String> {
        match onboarded {
            true => set(&self.conn, ONBOARDED, &true),
            false => self.forget(ONBOARDED),
        }
    }

    /// The theme of the space the user's first window opens on: the one
    /// used last, if there is one yet; none on a first run, before the
    /// first space is made.
    pub fn first_space_theme(&self) -> Result<Option<SpaceTheme>, String> {
        Ok(self.most_recent_space()?.map(|space| space.theme))
    }

    /// Gives the first space `theme`: the space used last, if there is one,
    /// or else the first that is made (`take_first_space_theme`).
    pub fn set_first_space_theme(&self, theme: SpaceTheme) -> Result<(), String> {
        match self.most_recent_space()? {
            Some(space) => {
                let change = SpaceChange {
                    name: None,
                    icon: None,
                    theme: Some(theme),
                };
                self.update_space(space.id, change).map(drop)
            }
            None => set(&self.conn, FIRST_THEME, &theme),
        }
    }

    /// The theme chosen for the first space before there was one, once:
    /// the space made with it has it, and a later one does not.
    pub(super) fn take_first_space_theme(&self) -> Option<SpaceTheme> {
        let theme = self.setting(FIRST_THEME).ok().flatten();
        if theme.is_some()
            && let Err(error) = self.forget(FIRST_THEME)
        {
            eprintln!("Wren could not forget the first space's theme: {error}");
        }
        theme
    }

    fn forget(&self, key: &str) -> Result<(), String> {
        self.conn
            .execute("DELETE FROM settings WHERE key = ?1", [key])
            .map(drop)
            .map_err(sql)
    }
}

#[cfg(test)]
mod tests {
    use crate::db::test_db as db;
    use crate::db::theme::SpaceTheme;
    use wren::ProfileListEntry;

    fn entry() -> ProfileListEntry {
        ProfileListEntry {
            id: "a".into(),
            name: "Alpha".into(),
            avatar: 0,
        }
    }

    #[test]
    fn is_not_done_until_it_is_set_and_again_once_reset() {
        let db = db();
        assert!(!db.onboarded());
        db.set_onboarded(true).unwrap();
        assert!(db.onboarded());
        db.set_onboarded(false).unwrap();
        assert!(!db.onboarded());
    }

    #[test]
    fn the_first_space_is_made_with_the_theme_chosen_before_it() {
        let db = db();
        let chosen = SpaceTheme::default_for("#0a84ff");
        assert_eq!(db.first_space_theme().unwrap(), None);
        db.set_first_space_theme(chosen.clone()).unwrap();
        db.sync_profiles(&[entry()]);
        assert_eq!(db.first_space_theme().unwrap(), Some(chosen.clone()));
        // Only the first: the choice is used up.
        assert_eq!(db.take_first_space_theme(), None);
    }

    #[test]
    fn a_space_there_already_takes_the_theme_at_once() {
        let db = db();
        db.sync_profiles(&[entry()]);
        let chosen = SpaceTheme::default_for("#ff375f");
        db.set_first_space_theme(chosen.clone()).unwrap();
        assert_eq!(db.first_space_theme().unwrap(), Some(chosen));
        assert_eq!(db.take_first_space_theme(), None);
    }
}
