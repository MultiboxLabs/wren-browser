// What onboarding keeps (onboarding.rs), beside the settings, as what the
// page never sees as one: whether the user has been through it, and what
// they chose for their first space until that space is made.

use serde::{Deserialize, Serialize};

use super::Db;
use super::settings::set;
use super::spaces::{SpaceChange, checked_icon};
use super::theme::SpaceTheme;

const ONBOARDED: &str = "onboarded";
const FIRST_SPACE: &str = "firstSpace";

/// What onboarding chose for the first space; it keeps its own of what was
/// not chosen.
#[derive(Clone, Debug, Default, Deserialize, Serialize, PartialEq)]
pub struct FirstSpace {
    pub icon: Option<String>,
    pub theme: Option<SpaceTheme>,
}

impl FirstSpace {
    // In range, or why it is not.
    fn checked(self) -> Result<FirstSpace, String> {
        Ok(FirstSpace {
            icon: self.icon.as_deref().map(checked_icon).transpose()?,
            theme: self.theme.map(SpaceTheme::checked).transpose()?,
        })
    }
}

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

    /// Gives the first space what was chosen for it: the space used last,
    /// if there is one, or else the first that is made
    /// (`take_first_space`).
    pub fn set_first_space(&self, chosen: FirstSpace) -> Result<(), String> {
        let chosen = chosen.checked()?;
        match self.most_recent_space()? {
            Some(space) => {
                let change = SpaceChange {
                    name: None,
                    icon: chosen.icon,
                    theme: chosen.theme,
                };
                self.update_space(space.id, change).map(drop)
            }
            None => set(&self.conn, FIRST_SPACE, &chosen),
        }
    }

    /// What was chosen for the first space before there was one, once: the
    /// space made with it has it, and a later one does not.
    pub(super) fn take_first_space(&self) -> FirstSpace {
        let chosen: Option<FirstSpace> = self.setting(FIRST_SPACE).ok().flatten();
        if chosen.is_some()
            && let Err(error) = self.forget(FIRST_SPACE)
        {
            eprintln!("Wren could not forget what was chosen for the first space: {error}");
        }
        chosen.unwrap_or_default()
    }
}

#[cfg(test)]
mod tests {
    use super::FirstSpace;
    use crate::db::DEFAULT_ICON;
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
    fn the_first_space_is_made_with_what_was_chosen_before_it() {
        let db = db();
        let chosen = FirstSpace {
            icon: Some("lucide:leaf".into()),
            theme: Some(SpaceTheme::default_for("#0a84ff")),
        };
        assert!(db.most_recent_space().unwrap().is_none());
        db.set_first_space(chosen.clone()).unwrap();
        db.sync_profiles(&[entry()]);
        let space = db.most_recent_space().unwrap().unwrap();
        assert_eq!(Some(space.icon), chosen.icon);
        assert_eq!(Some(space.theme), chosen.theme);
        // Only the first: the choice is used up.
        assert_eq!(db.take_first_space(), FirstSpace::default());
    }

    #[test]
    fn a_space_there_already_takes_what_was_chosen_at_once() {
        let db = db();
        db.sync_profiles(&[entry()]);
        // One whose hue comes back from the database to the last bit.
        let theme = SpaceTheme::default_for("#0a84ff");
        let chosen = FirstSpace {
            icon: None,
            theme: Some(theme.clone()),
        };
        db.set_first_space(chosen).unwrap();
        // What was not chosen, it keeps.
        let space = db.most_recent_space().unwrap().unwrap();
        assert_eq!(space.icon, DEFAULT_ICON);
        assert_eq!(space.theme, theme);
        assert_eq!(db.take_first_space(), FirstSpace::default());
    }
}
