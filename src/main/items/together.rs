// Several tabs of the list moved at once: the rows marked in the sidebar,
// dragged or kept together (`move_items`). They land one after another from
// the place the move names, in the order they are given, each as it would
// alone (`move_listed`): a tab, or a split's two.
//
// The place in the list is an index among the list's tabs without those
// that move. It is kept as the tab that is there (`anchor`), which each
// item then lands before, so the items yet to move, wherever they are, do
// not change where the next one goes.

use std::collections::VecDeque;
use std::rc::Rc;

use wren::{BrowserTab, MainThread};

use super::{
    Destination, ItemRef, Listed, Moved, Target, listed, may_land, move_listed, moving, place_of,
};
use crate::app::State;
use crate::pins::PinTarget;
use crate::shell::{Place, WindowId};
use crate::tabs;

type Done = Box<dyn FnOnce(Result<Vec<Moved>, String>)>;

// What is left of a move of several items, as each lands.
struct Together {
    state: Rc<State>,
    mt: MainThread,
    window: WindowId,
    place: Place,
    to: Target,
    // The tab of the destination's list the items land before; none, last.
    anchor: Option<BrowserTab>,
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
        let found = state.windows.get(window).ok_or("The window is closing.")?;
        if items.is_empty() {
            return Err("Nothing is moved.".to_owned());
        }
        // All may go there, or none go.
        let mut all = Vec::new();
        for item in &items {
            let (Listed::Tab(tab), source) = listed(mt, item)? else {
                return Err("Only tabs of the list move together.".into());
            };
            if !found.has_browser(&source) {
                return Err("There is no such item.".into());
            }
            let row = moving(&source, Listed::Tab(tab))?;
            may_land(Listed::Tab(tab), row.len(), &to.target)?;
            all.extend(row);
        }
        match to.target {
            Target::Split { .. } => {
                return Err("Only a tab alone makes a split with another.".into());
            }
            Target::Favorites { .. } => drop(PinTarget::Favorites.resolve(state, &place)?),
            Target::Pinned { folder, .. } => {
                drop(PinTarget::Space { parent: folder }.resolve(state, &place)?);
            }
            Target::Tabs { .. } => {}
        }
        let anchor = match (&to.target, found.browser_of(&place)) {
            (Target::Tabs { index, .. }, Some(there)) => {
                let mut stay = tabs::listed(&there)
                    .into_iter()
                    .filter(|tab| !all.contains(tab));
                stay.nth(*index)
            }
            _ => None,
        };
        Ok((place, anchor))
    })();
    match checked {
        Ok((place, anchor)) => Together {
            state: state.clone(),
            mt,
            window,
            place,
            to: to.target,
            anchor,
            left: items.into(),
            moved: Vec::new(),
        }
        .next(done),
        Err(error) => done(Err(error)),
    }
}

impl Together {
    // Moves the next item, then the rest; one that fails ends it, and those
    // before it stay where they landed.
    fn next(mut self, done: Done) {
        let Some(item) = self.left.pop_front() else {
            return done(Ok(self.moved));
        };
        let placed = self.moved.len();
        let target = match &self.to {
            Target::Tabs { group, .. } => Target::Tabs {
                group: group.clone(),
                index: self.index_for(&item),
            },
            Target::Favorites { index } => Target::Favorites {
                index: index.map(|index| index + placed),
            },
            Target::Pinned { folder, index } => Target::Pinned {
                folder: *folder,
                index: index.map(|index| index + placed),
            },
            split @ Target::Split { .. } => split.clone(),
        };
        let (state, mt, window, place) =
            (self.state.clone(), self.mt, self.window, self.place.clone());
        move_listed(
            &state,
            mt,
            window,
            place,
            item,
            target,
            move |moved| match moved {
                Ok(moved) => {
                    self.moved.push(moved);
                    self.next(done);
                }
                Err(error) => done(Err(error)),
            },
        );
    }

    // Where `item` goes in the destination's list, as a move of it alone
    // takes it: the anchor's index among the list's tabs without the item's
    // own, or past the last of them.
    fn index_for(&self, item: &ItemRef) -> usize {
        let own = match item {
            ItemRef::Tab(id) => BrowserTab::from_id(self.mt, *id).map(tabs::with_split),
            _ => None,
        }
        .unwrap_or_default();
        let there = self.state.windows.get(self.window);
        let Some(there) = there.and_then(|window| window.browser_of(&self.place)) else {
            return 0;
        };
        let others: Vec<BrowserTab> = tabs::listed(&there)
            .into_iter()
            .filter(|tab| !own.contains(tab))
            .collect();
        self.anchor
            .and_then(|anchor| others.iter().position(|tab| *tab == anchor))
            .unwrap_or(others.len())
    }
}
