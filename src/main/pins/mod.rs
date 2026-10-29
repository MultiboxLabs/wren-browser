// Pins: tabs, splits and folders the user keeps, drawn as favourites (a
// profile's, which each of its spaces shows) or as a space's pins. They are
// kept in the app's database (db/pins.rs), not as Chromium's bookmarks.

use wren::{BrowserTab, SplitLayout, SplitState};

use crate::app::State;
use crate::db::{NewPin, PinId, PinLayout, PinPage, PinPlace, SpaceId};
use crate::shell::Place;

/// Where a pin goes, as the page and the menus name it: the favourites of
/// the place's profile, or the place's space's pins.
#[derive(Clone, Copy, Debug)]
pub enum PinTarget {
    Favorites,
    Space { parent: Option<PinId> },
}

impl PinTarget {
    /// The place in the database a pin goes to from a window on `place`. A
    /// window on a profile has its favourites and no pins; an off-the-record
    /// one has neither.
    pub fn resolve(self, state: &State, place: &Place) -> Result<PinPlace, String> {
        match (self, place) {
            (
                _,
                Place::Profile {
                    off_the_record: true,
                    ..
                },
            ) => Err("An incognito window keeps no pins.".into()),
            (PinTarget::Favorites, Place::Space(space)) => {
                let space = state.db.space(*space)?.ok_or("That space is gone.")?;
                Ok(PinPlace::Favorites {
                    profile: space.profile,
                })
            }
            (PinTarget::Favorites, Place::Profile { id, .. }) => Ok(PinPlace::Favorites {
                profile: id.clone(),
            }),
            (PinTarget::Space { parent }, Place::Space(space)) => Ok(PinPlace::Space {
                space: *space,
                parent,
            }),
            (PinTarget::Space { .. }, Place::Profile { .. }) => {
                Err("A window on a profile has no pins.".into())
            }
        }
    }
}

/// Keeps `tab` as a pin of `place`, at `index` (None: last), as its page is
/// now, and answers the pin's ID. A tab in a split is kept with the other,
/// as one split pin.
pub fn keep_tab(
    state: &State,
    place: &Place,
    tab: BrowserTab,
    target: PinTarget,
    index: Option<usize>,
) -> Result<PinId, String> {
    let split = tab.state().ok().and_then(|state| state.split);
    let pin = match split.and_then(|split| split.state().ok()) {
        Some(SplitState {
            first: Some(first),
            second: Some(second),
            layout,
            ratio,
        }) => NewPin::Split {
            first: page_of(first),
            second: page_of(second),
            layout: match layout {
                SplitLayout::Stacked => PinLayout::Stacked,
                _ => PinLayout::SideBySide,
            },
            ratio,
        },
        _ => NewPin::Tab(page_of(tab)),
    };
    let id = state
        .db
        .create_pin(&target.resolve(state, place)?, index, pin)?;
    crate::ipc::broadcast_pins(state);
    Ok(id)
}

/// Makes a folder named "New Folder" among a space's pins, and answers its ID.
pub fn new_folder(
    state: &State,
    space: SpaceId,
    parent: Option<PinId>,
    index: Option<usize>,
) -> Result<PinId, String> {
    let place = PinPlace::Space { space, parent };
    let folder = NewPin::Folder {
        name: "New Folder".into(),
    };
    let id = state.db.create_pin(&place, index, folder)?;
    crate::ipc::broadcast_pins(state);
    Ok(id)
}

// `tab`'s page, as it is now.
fn page_of(tab: BrowserTab) -> PinPage {
    PinPage {
        url: tab.url(),
        title: tab.title(),
        favicon: tab.favicon_png(),
    }
}
