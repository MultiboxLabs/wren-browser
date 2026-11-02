// Spaces, landed as Wren's: each a space of the profile, with its name, its
// icon (an emoji as it is, a named one through `NAMED`, else Wren's own) and
// its colours; its pins with their folders and splits; and the favourites.
// All of a profile's at once (Db::add_spaces), then every window is told.

use std::rc::Rc;

use crate::app::State;
use crate::db::{
    Added, ImportedPin, ImportedSpace, NewPin, NewSpace, PinLayout, PinPage as WrenPage,
    SpaceTheme, avatar,
};
use crate::import::data::{Pin, PinPage, SpaceIcon, Spaces};
use crate::ipc;

/// A space with no icon of its own has Wren's.
const DEFAULT_ICON: &str = "lucide:orbit";

/// The sources' own names for their icons, as Lucide's (`lucide:<name>`).
/// A name is matched by its first word ("star.fill" is "star").
const NAMED: [(&str, &str); 30] = [
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
                theme: theme(&space.colours, profile),
            },
            pins: space.pins.into_iter().map(pin).collect(),
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

// Its colours, the first its main one; or the profile's own, as Wren gives
// a space it makes.
fn theme(colours: &[[u8; 3]], profile: &str) -> SpaceTheme {
    let Some([red, green, blue]) = colours.first() else {
        return SpaceTheme::default_for(avatar(profile));
    };
    let mut theme = SpaceTheme::default_for(&format!("#{red:02x}{green:02x}{blue:02x}"));
    theme.colors = colours.len().clamp(1, 3) as u8;
    theme
}

fn page(page: PinPage) -> WrenPage {
    WrenPage {
        url: page.url,
        title: page.title,
        favicon: None,
    }
}

fn pin(each: Pin) -> ImportedPin {
    match each {
        Pin::Tab(tab) => ImportedPin::Pin(NewPin::Tab(page(tab))),
        Pin::Split {
            first,
            second,
            stacked,
            ratio,
        } => ImportedPin::Pin(NewPin::Split {
            first: page(first),
            second: page(second),
            layout: if stacked {
                PinLayout::Stacked
            } else {
                PinLayout::SideBySide
            },
            ratio,
        }),
        Pin::Folder { name, pins } => ImportedPin::Folder {
            name,
            pins: pins.into_iter().map(pin).collect(),
        },
    }
}

// Favourites have no folders: what was in one comes out of it.
fn flatten(pins: Vec<Pin>) -> Vec<NewPin> {
    pins.into_iter()
        .flat_map(|each| match each {
            Pin::Folder { pins, .. } => flatten(pins),
            each => match pin(each) {
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
}
