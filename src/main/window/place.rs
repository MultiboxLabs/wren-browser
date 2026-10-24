// What a window shows a Browser for: one of the user's spaces, or a profile
// with no space, or a profile's off-the-record side. A window that shows a
// profile shows only that, and never switches.

use std::fmt;
use std::str::FromStr;

use crate::db::SpaceId;

#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub enum Place {
    /// One of the user's spaces.
    Space(SpaceId),
    /// A profile by its ID, or its off-the-record side.
    Profile { id: String, off_the_record: bool },
}

impl Place {
    /// The space it is, if it is one.
    pub fn space(&self) -> Option<SpaceId> {
        match self {
            Place::Space(space) => Some(*space),
            Place::Profile { .. } => None,
        }
    }
}

// As a Browser's session tag keeps it (tag.rs): a space by its ID, as it
// always was, and a profile by its ID after "p:", or "o:" for its
// off-the-record side.
impl fmt::Display for Place {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        match self {
            Place::Space(space) => write!(f, "{space}"),
            Place::Profile {
                id,
                off_the_record: false,
            } => write!(f, "p:{id}"),
            Place::Profile {
                id,
                off_the_record: true,
            } => write!(f, "o:{id}"),
        }
    }
}

impl FromStr for Place {
    type Err = ();

    fn from_str(text: &str) -> Result<Place, ()> {
        let profile = |id: &str, off_the_record| match id {
            "" => Err(()),
            id => Ok(Place::Profile {
                id: id.to_owned(),
                off_the_record,
            }),
        };
        if let Some(id) = text.strip_prefix("p:") {
            return profile(id, false);
        }
        if let Some(id) = text.strip_prefix("o:") {
            return profile(id, true);
        }
        text.parse().map(Place::Space).map_err(drop)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn profile(id: &str, off_the_record: bool) -> Place {
        Place::Profile {
            id: id.into(),
            off_the_record,
        }
    }

    #[test]
    fn reads_what_it_writes() {
        for place in [
            Place::Space(3),
            profile("Default", false),
            profile("Profile 1", true),
        ] {
            assert_eq!(place.to_string().parse(), Ok(place));
        }
    }

    #[test]
    fn reads_only_places() {
        assert_eq!("p:".parse::<Place>(), Err(()));
        assert_eq!("x:1".parse::<Place>(), Err(()));
        assert_eq!("".parse::<Place>(), Err(()));
    }
}
