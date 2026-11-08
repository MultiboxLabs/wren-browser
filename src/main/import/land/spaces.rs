// Spaces, landed as Wren's: each a space of the profile, with its name, its
// icon (an emoji as it is, a named one through `NAMED`, else Wren's own) and
// its colours; its pins with their folders and splits; and the favourites.
// All of a profile's at once (Db::add_spaces), then every window is told.

use std::rc::Rc;

use super::imported;
use crate::app::State;
use crate::db::{
    Added, Appearance, DEFAULT_ICON, Hsb, ImportedPin, ImportedSpace, NamedPin, NewSpace,
    SpaceTheme, avatar,
};
use crate::import::data::{Look, Pin, SpaceIcon, Spaces};
use crate::ipc;

/// The sources' own names for their icons, as Lucide's (`lucide:<name>`).
/// A name is matched by its first word ("star.fill" is "star").
const NAMED: &[(&str, &str)] = &[
    ("star", "star"),
    ("house", "house"),
    ("home", "house"),
    ("briefcase", "briefcase"),
    ("work", "briefcase"),
    ("book", "book"),
    ("books", "library"),
    ("graduationcap", "graduation-cap"),
    ("school", "graduation-cap"),
    ("gamecontroller", "gamepad-2"),
    ("game", "gamepad-2"),
    ("music", "music"),
    ("cart", "shopping-cart"),
    ("heart", "heart"),
    ("globe", "globe"),
    ("moon", "moon"),
    ("sun", "sun"),
    ("leaf", "leaf"),
    ("flame", "flame"),
    ("bolt", "zap"),
    ("paintpalette", "palette"),
    ("palette", "palette"),
    ("camera", "camera"),
    ("code", "code"),
    ("terminal", "code"),
    ("person", "users"),
    ("airplane", "plane"),
    ("cup", "coffee"),
    ("bookmark", "bookmark"),
    ("folder", "folder"),
    ("planet", "orbit"),
    ("construction", "wrench"),
    ("hammer", "wrench"),
    ("wrench", "wrench"),
    ("bed", "bed-double"),
    ("video", "film"),
    ("film", "film"),
    ("tv", "tv"),
    ("fire", "flame"),
    ("paintbrush", "palette"),
    ("pencil", "pencil"),
    ("lightbulb", "lightbulb"),
    ("rocket", "rocket"),
    ("gift", "gift"),
    ("trophy", "trophy"),
    ("map", "map"),
    ("cloud", "cloud"),
    ("flask", "flask-conical"),
    ("chart", "chart-line"),
    ("dollarsign", "wallet"),
    ("creditcard", "wallet"),
    ("bag", "shopping-bag"),
    ("fork", "utensils"),
    ("envelope", "mail"),
    ("laptopcomputer", "laptop"),
    ("desktopcomputer", "laptop"),
    ("phone", "phone"),
    ("headphones", "headphones"),
    ("pawprint", "paw-print"),
    ("dumbbell", "dumbbell"),
    ("figure", "dumbbell"),
    ("newspaper", "newspaper"),
    ("calendar", "calendar"),
    ("sparkles", "sparkles"),
];

/// Lands `spaces` in the Wren profile `profile`. A profile made for them
/// lets go of the empty space Wren gave it (`made_for_them`).
pub fn land(
    state: &Rc<State>,
    profile: &str,
    spaces: Spaces,
    made_for_them: bool,
) -> Result<Added, String> {
    let before: Vec<_> = state
        .db
        .list_spaces()?
        .into_iter()
        .filter(|space| space.profile == profile)
        .collect();
    let imported = spaces
        .spaces
        .into_iter()
        .map(|space| ImportedSpace {
            space: NewSpace {
                name: space.name,
                icon: icon(&space.icon),
                theme: theme(&space.look, profile),
            },
            pins: space.pins.into_iter().map(imported).collect(),
        })
        .collect();
    let favorites = flatten(spaces.favorites);
    let added = state.db.add_spaces(profile, imported, favorites)?;
    if made_for_them && added.spaces > 0 {
        for space in before {
            if state.db.space_pins(space.id)?.is_empty() {
                state.db.delete_space(space.id)?;
            }
        }
    }
    ipc::broadcast_spaces(state);
    ipc::broadcast_pins(state);
    Ok(added)
}

fn icon(icon: &SpaceIcon) -> String {
    match icon {
        // An emoji, as `checked_icon` takes one: no ASCII, at most 32 bytes.
        SpaceIcon::Emoji(emoji) if emoji.len() <= 32 && !emoji.is_empty() && !emoji.is_ascii() => {
            emoji.clone()
        }
        SpaceIcon::Named(name) => {
            let word = name
                .split(['.', '-', '_'])
                .next()
                .unwrap_or("")
                .to_lowercase();
            NAMED
                .iter()
                .find(|(source, _)| *source == word)
                .map_or(DEFAULT_ICON.to_owned(), |(_, lucide)| {
                    format!("lucide:{lucide}")
                })
        }
        _ => DEFAULT_ICON.to_owned(),
    }
}

// Its theme, drawn as its source drew it: its main colour exactly, how much
// of it shows, light or dark, and its grain. With no colour, the profile's
// own, as Wren gives a space it makes.
fn theme(look: &Look, profile: &str) -> SpaceTheme {
    let default = SpaceTheme::default_for(avatar(profile));
    let Some(&main) = look.colours.first() else {
        return default;
    };
    let mut theme = default.clone();
    theme.primary = Hsb::of_srgb(main);
    theme.colors = look.colours.len().clamp(1, 3) as u8;
    theme.appearance = match look.dark {
        Some(true) => Appearance::Dark,
        Some(false) => Appearance::Light,
        None => Appearance::Auto,
    };
    theme.intensity = look.intensity.unwrap_or(theme.intensity);
    theme.noise = look.noise;
    theme.checked().unwrap_or(default)
}

// Favourites have no folders: what was in one comes out of it.
fn flatten(pins: Vec<Pin>) -> Vec<NamedPin> {
    pins.into_iter()
        .flat_map(|each| match each {
            Pin::Folder { pins, .. } => flatten(pins),
            each => match imported(each) {
                ImportedPin::Pin(made) => vec![made],
                ImportedPin::Folder { .. } => Vec::new(),
            },
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_icons_to_wrens() {
        assert_eq!(icon(&SpaceIcon::Emoji("🏠".into())), "🏠");
        assert_eq!(icon(&SpaceIcon::Named("star.fill".into())), "lucide:star");
        assert_eq!(
            icon(&SpaceIcon::Named("graduationcap".into())),
            "lucide:graduation-cap"
        );
        assert_eq!(icon(&SpaceIcon::Named("unheard-of".into())), DEFAULT_ICON);
        assert_eq!(icon(&SpaceIcon::None), DEFAULT_ICON);
    }

    // Each is one the space's icon picker has, so it draws.
    #[test]
    fn maps_only_to_icons_wren_has() {
        let catalog = include_str!("../../../renderer/components/icon-picker/catalog.ts");
        for (_, lucide) in NAMED {
            assert!(
                catalog.contains(&format!("\"{lucide}\"")),
                "{lucide} is not in the catalog"
            );
        }
    }
}
