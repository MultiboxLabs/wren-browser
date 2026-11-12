// Several items moved at once: the rows marked in the sidebar, dragged or
// kept together (`move_items`). They are all tabs of the list, or all
// pinned tabs, and land one after another from the place the move names,
// in the order they are given, each as it would alone (`move_item`).
//
// The place is an index among what is there without the items that move.
// It is kept as what is at that index (`Anchor`), a tab of the list or a
// pin, which each item then lands before. So the items yet to move,
// wherever they are, do not change where the next one goes.

use std::collections::VecDeque;
use std::rc::Rc;

use wren::{BrowserTab, MainThread};

use super::{
    Destination, ItemRef, Listed, Moved, Target, listed, may_land, move_item, moving, place_of,
};
use crate::app::State;
use crate::db::{PinId, PinKind, PinPlace};
use crate::pins::{self, PinTarget};
use crate::shell::{Place, WindowId};
use crate::tabs;

type Done = Box<dyn FnOnce(Result<Vec<Moved>, String>)>;

// What the items land before, where they go; none, last.
enum Anchor {
    /// A tab of the destination's list.
    Tab(Option<BrowserTab>),
    /// A pin among those of a place: the favourites, a space's pins or a
    /// folder's.
    Pin(PinPlace, Option<PinId>),
}

// What is left of a move of several items, as each lands.
struct Together {
    state: Rc<State>,
    mt: MainThread,
    window: WindowId,
    place: Place,
    to: Destination,
    anchor: Anchor,
    left: VecDeque<ItemRef>,
    moved: Vec<Moved>,
}

pub(super) fn move_together(
    state: &Rc<State>,
    mt: MainThread,
    window: WindowId,
    items: Vec<ItemRef>,
    to: Destination,
    done: Done,
) {
    let checked = (|| {
        let place = place_of(state, window, to.space)?;
        // All may go there, or none go.
        let (tabs, kept) = movable(state, mt, window, &items, &to.target)?;
        let anchor = match &to.target {
            Target::Split { .. } => {
                return Err("Only a tab alone makes a split with another.".into());
            }
            Target::Tabs { index, .. } => {
                let found = state.windows.get(window).ok_or("The window is closing.")?;
                let there = found.browser_of(&place);
                let listed = there.map_or_else(Vec::new, |there| tabs::listed(&there));
                let mut stay = listed.into_iter().filter(|tab| !tabs.contains(tab));
                Anchor::Tab(stay.nth(*index))
            }
            Target::Favorites { index } => {
                among(state, &place, PinTarget::Favorites, *index, &kept)?
            }
            Target::Pinned { folder, index } => {
                let target = PinTarget::Space { parent: *folder };
                among(state, &place, target, *index, &kept)?
            }
        };
        Ok((place, anchor))
    })();
    match checked {
        Ok((place, anchor)) => Together {
            state: state.clone(),
            mt,
            window,
            place,
            to,
            anchor,
            left: items.into(),
            moved: Vec::new(),
        }
        .next(done),
        Err(error) => done(Err(error)),
    }
}

// The tabs of the list that `items` move, or the pins: all of one kind, in
// window `window`, and each free to go to `target`.
fn movable(
    state: &State,
    mt: MainThread,
    window: WindowId,
    items: &[ItemRef],
    target: &Target,
) -> Result<(Vec<BrowserTab>, Vec<PinId>), String> {
    let found = state.windows.get(window).ok_or("The window is closing.")?;
    let (mut tabs, mut kept) = (Vec::new(), Vec::new());
    for item in items {
        match item {
            ItemRef::Pin(id) => {
                let (_, _, pin) = state.db.pin(*id)?.ok_or("That pin is gone.")?;
                if matches!(pin.kind, PinKind::Folder { .. }) {
                    return Err("A folder does not move with others.".into());
                }
                kept.push(*id);
            }
            ItemRef::Tab(_) | ItemRef::Group(_) => {
                let (Listed::Tab(tab), source) = listed(mt, item)? else {
                    return Err("A group does not move with others.".into());
                };
                if !found.has_browser(&source) {
                    return Err("There is no such item.".into());
                }
                let row = moving(&source, Listed::Tab(tab))?;
                may_land(Listed::Tab(tab), row.len(), target)?;
                tabs.extend(row);
            }
        }
    }
    match (tabs.is_empty(), kept.is_empty()) {
        (true, true) => Err("Nothing is moved.".into()),
        (false, false) => Err("Tabs of the list and pinned tabs do not move together.".into()),
        _ => Ok((tabs, kept)),
    }
}

// The pin at `index` of those of `target` that stay, which is not one of
// `moving`.
fn among(
    state: &State,
    place: &Place,
    target: PinTarget,
    index: Option<usize>,
    moving: &[PinId],
) -> Result<Anchor, String> {
    let to = target.resolve(state, place)?;
    let mut stay = pins::siblings(state, &to)?
        .into_iter()
        .filter(|pin| !moving.contains(pin));
    let anchor = index.and_then(|index| stay.nth(index));
    Ok(Anchor::Pin(to, anchor))
}

impl Together {
    // Moves the next item, then the rest; one that fails ends it, and those
    // before it stay where they landed.
    fn next(mut self, done: Done) {
        let Some(item) = self.left.pop_front() else {
            return done(Ok(self.moved));
        };
        let target = match self.target_for(&item) {
            Ok(target) => target,
            Err(error) => return done(Err(error)),
        };
        let to = Destination {
            space: self.to.space,
            target,
        };
        let (state, mt, window) = (self.state.clone(), self.mt, self.window);
        move_item(&state, mt, window, item, to, move |moved| match moved {
            Ok(moved) => {
                self.moved.push(moved);
                self.next(done);
            }
            Err(error) => done(Err(error)),
        });
    }

    // Where `item` goes, as a move of it alone takes it: before the anchor,
    // by the anchor's index among what is there without the item itself, or
    // last.
    fn target_for(&self, item: &ItemRef) -> Result<Target, String> {
        let index = match &self.anchor {
            Anchor::Tab(anchor) => {
                let own = match item {
                    ItemRef::Tab(id) => BrowserTab::from_id(self.mt, *id).map(tabs::with_split),
                    _ => None,
                };
                let own = own.unwrap_or_default();
                let there = self.state.windows.get(self.window);
                let there = there.and_then(|window| window.browser_of(&self.place));
                let mut others = there.map_or_else(Vec::new, |there| tabs::listed(&there));
                others.retain(|tab| !own.contains(tab));
                let at = anchor.and_then(|anchor| others.iter().position(|tab| *tab == anchor));
                Some(at.unwrap_or(others.len()))
            }
            Anchor::Pin(place, anchor) => {
                let mut others = pins::siblings(&self.state, place)?;
                others.retain(|pin| !matches!(item, ItemRef::Pin(own) if own == pin));
                anchor.and_then(|anchor| others.iter().position(|pin| *pin == anchor))
            }
        };
        Ok(match &self.to.target {
            Target::Tabs { group, .. } => Target::Tabs {
                group: group.clone(),
                index: index.unwrap_or(0),
            },
            Target::Favorites { .. } => Target::Favorites { index },
            Target::Pinned { folder, .. } => Target::Pinned {
                folder: *folder,
                index,
            },
            split @ Target::Split { .. } => split.clone(),
        })
    }
}
