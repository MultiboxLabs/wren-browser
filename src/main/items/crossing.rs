// Whether a move takes tabs to another profile, where they are made again
// without their history (windows/move_tabs.rs), and what of them: tabs of
// the list a drop moves, or a popup's page. The page asks before they go,
// unless the user said not to (ipc/profile_move.rs).

use serde::Serialize;
use wren::{Browser, MainThread};

use super::{Destination, ItemRef, Listed, listed, moving, place_of};
use crate::app::State;
use crate::db::SpaceId;
use crate::shell::{Place, WindowId};

/// What a move makes again in another profile, tabs of the list or a
/// popup's page, as the page asks about it.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Crossing {
    /// The space they go to; none for a window on a profile.
    space: Option<SpaceId>,
    /// The profile they go to.
    profile: String,
    /// What goes, for the page to name it.
    what: Crossed,
    /// How many tabs go, a split's two counted.
    tabs: usize,
}

/// What a move makes again in another profile.
#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
enum Crossed {
    /// A tab alone.
    Tab,
    /// A group, with its tabs.
    Group,
    /// Several tabs: a split's two, or several marked.
    Tabs,
}

/// What of `items` a move to `to` in window `window` makes again in another
/// profile, if any of it. Pins stay with their profile, and an item that has
/// gone is left to the move, which says so.
pub fn crossing(
    state: &State,
    mt: MainThread,
    window: WindowId,
    items: &[ItemRef],
    to: &Destination,
) -> Result<Option<Crossing>, String> {
    let place = place_of(state, window, to.space)?;
    let (mut rows, mut groups, mut tabs) = (0, 0, 0);
    for item in items {
        let Ok((item, source)) = listed(mt, item) else {
            continue;
        };
        if !state.remakes_for(&source, &place)? {
            continue;
        }
        rows += 1;
        groups += usize::from(matches!(item, Listed::Group(_)));
        tabs += moving(&source, item)?.len();
    }
    if rows == 0 {
        return Ok(None);
    }
    let what = match (rows, groups, tabs) {
        (1, 1, _) => Crossed::Group,
        (_, _, 1) => Crossed::Tab,
        _ => Crossed::Tabs,
    };
    crossing_to(state, &place, what, tabs).map(Some)
}

/// What a popup's page, a tab of `source`, makes again in another profile
/// as it goes to `place`, if it does.
pub fn page_crossing(
    state: &State,
    source: &Browser,
    place: &Place,
) -> Result<Option<Crossing>, String> {
    if !state.remakes_for(source, place)? {
        return Ok(None);
    }
    crossing_to(state, place, Crossed::Tab, 1).map(Some)
}

// `what`, of `tabs` tabs, that goes to `place`.
fn crossing_to(
    state: &State,
    place: &Place,
    what: Crossed,
    tabs: usize,
) -> Result<Crossing, String> {
    let shown = state.profile_shown(place)?;
    Ok(Crossing {
        space: place.space(),
        profile: shown.profile().unwrap_or_default().to_owned(),
        what,
        tabs,
    })
}
