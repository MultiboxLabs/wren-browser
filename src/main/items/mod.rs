// What a drop in the sidebar does. Everything the sidebar draws is an item: a
// tab of the list (or its split), a group, or a pin (pins/), which is a
// pinned tab, a favourite or a folder. The page says which item goes where
// (ipc/items.rs), and this decides what that means: a move in the list, into
// a group or out of one, pinning, unpinning, a move among the pins, or a
// split. It is the one place that knows which item may go where, and calls
// tabs/ and pins/ for each.
//
// An item of the list that is in another of the window's spaces moves to the
// destination's Browser first (windows/move_tabs.rs), then lands as one of
// its own would.

use std::rc::Rc;

use serde::Deserialize;
use wren::{Browser, BrowserTab, MainThread, TabGroup};

use crate::app::State;
use crate::db::{PinId, SpaceId};
use crate::pins::{self, PinTarget};
use crate::shell::{Place, WindowId};
use crate::tabs;

/// An item, as the page names it: a tab of the list, which stands for its
/// split if it is in one; a group, by one of its tabs; or a pin.
#[derive(Clone, Copy, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ItemRef {
    Tab(i32),
    Group(i32),
    Pin(PinId),
}

/// Where an item goes: a place in the sidebar of `space`, or of the window's
/// own place if it names none, as a window on a profile does.
#[derive(Clone, Copy, Debug, Deserialize)]
pub struct Destination {
    pub space: Option<SpaceId>,
    #[serde(flatten)]
    pub target: Target,
}

/// A place in a sidebar.
#[derive(Clone, Copy, Debug, Deserialize)]
#[serde(tag = "to", rename_all = "camelCase")]
pub enum Target {
    /// Among the favourites, at `index` (None: last).
    Favorites { index: Option<usize> },
    /// Among the space's pins, at the top or in `folder`, at `index` there
    /// (None: last).
    Pinned {
        folder: Option<PinId>,
        index: Option<usize>,
    },
    /// In the list, its first tab at `index` among the list's tabs
    /// (`tabs::listed`), in the group of the tab `group` names, or in none.
    Tabs { group: Option<i32>, index: usize },
    /// On `side` of the row of another tab, to make a split with it.
    Split { with: ItemRef, side: Side },
}

/// The half of a row a tab is dropped on.
#[derive(Clone, Copy, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Side {
    Left,
    Right,
}

/// What a move did, for what counts it (analytics/).
pub enum Moved {
    /// It changed place where it was kept: in the list, or among the pins.
    Placed,
    /// A tab of the list became a pin.
    Pinned(PinTarget),
    /// A pin became a tab of the list.
    Unpinned,
    /// Two tabs became a split, one of them a pin's if `pin`.
    Split { pin: bool },
}

/// What a dropped address became.
pub enum Added {
    Tab,
    Pin,
}

/// Moves `item` to `to` in window `window`, then calls `done` with what
/// that did, or why it did not move. A space without a Browser gets one
/// first, so `done` may be called later.
pub fn move_item(
    state: &Rc<State>,
    mt: MainThread,
    window: WindowId,
    item: ItemRef,
    to: Destination,
    done: impl FnOnce(Result<Moved, String>) + 'static,
) {
    let place = match place_of(state, window, to.space) {
        Ok(place) => place,
        Err(error) => return done(Err(error)),
    };
    match item {
        ItemRef::Pin(id) => move_pin(state, mt, window, place, id, to.target, done),
        ItemRef::Tab(id) | ItemRef::Group(id) => {
            move_listed(state, mt, window, place, item, id, to.target, done)
        }
    }
}

/// Puts an address dropped on the sidebar at `to`: a tab on it in the list,
/// shown, or an unopened pin among the pins or the favourites. Calls `done`
/// with which, as `move_item` does.
pub fn add_address(
    state: &Rc<State>,
    mt: MainThread,
    window: WindowId,
    url: String,
    to: Destination,
    done: impl FnOnce(Result<Added, String>) + 'static,
) {
    let place = match place_of(state, window, to.space) {
        Ok(place) => place,
        Err(error) => return done(Err(error)),
    };
    let pin = |target, index| {
        pins::add_address(state, &place, &url, target, index).map(|_| Added::Pin)
    };
    match to.target {
        Target::Favorites { index } => done(pin(PinTarget::Favorites, index)),
        Target::Pinned { folder, index } => done(pin(PinTarget::Space { parent: folder }, index)),
        Target::Tabs { group, index } => with_browser(state, mt, window, place, move |browser| {
            done(browser.and_then(|browser| {
                let group = group_of(mt, &browser, group)?;
                tabs::open_at(mt, &browser, &url, index, group).map_err(failed)?;
                Ok(Added::Tab)
            }));
        }),
        Target::Split { .. } => done(Err("An address makes no split.".into())),
    }
}

// A pin goes among the pins or the favourites as it is, and to the list as
// an ordinary tab. The database refuses a folder in the favourites.
fn move_pin(
    state: &Rc<State>,
    mt: MainThread,
    window: WindowId,
    place: Place,
    id: PinId,
    target: Target,
    done: impl FnOnce(Result<Moved, String>) + 'static,
) {
    let among = |target, index| {
        pins::move_pin(state, &place, id, target, index).map(|()| Moved::Placed)
    };
    match target {
        Target::Favorites { index } => done(among(PinTarget::Favorites, index)),
        Target::Pinned { folder, index } => {
            done(among(PinTarget::Space { parent: folder }, index))
        }
        Target::Tabs { group, index } => {
            let (inner, to) = (state.clone(), place.clone());
            with_browser(state, mt, window, place, move |browser| {
                done(browser.and_then(|browser| {
                    let group = group_of(mt, &browser, group)?;
                    pins::to_list(&inner, mt, &browser, &to, id, index, group)?;
                    Ok(Moved::Unpinned)
                }));
            });
        }
        Target::Split { .. } => done(Err("A pin is not dropped on a tab.".into())),
    }
}

// A tab of the list, its split or its group, named by tab `id`: it lands in
// its own Browser at once, or moves to the destination's first.
#[allow(clippy::too_many_arguments)]
fn move_listed(
    state: &Rc<State>,
    mt: MainThread,
    window: WindowId,
    place: Place,
    item: ItemRef,
    id: i32,
    target: Target,
    done: impl FnOnce(Result<Moved, String>) + 'static,
) {
    let found = (|| {
        let found = state.windows.get(window).ok_or("The window is closing.")?;
        let tab = BrowserTab::from_id(mt, id).ok_or("There is no such tab.")?;
        let source = tab
            .browser()
            .filter(|browser| found.has_browser(browser))
            .ok_or("There is no such tab.")?;
        let moving = moving(&source, tab, item)?;
        may_land(item, moving.len(), target)?;
        Ok::<_, String>((tab, source, moving, found.browser_of(&place)))
    })();
    let (tab, source, moving, there) = match found {
        Ok(found) => found,
        Err(error) => return done(Err(error)),
    };
    if there.as_ref() == Some(&source) {
        return done(land(state, mt, &source, &place, tab, item, target));
    }
    let Place::Space(space) = place else {
        return done(Err("A tab moves only among a window's spaces.".into()));
    };
    // Where it is dropped in the list, or beside the tab it splits with;
    // what is pinned goes to the top first.
    let index = match target {
        Target::Tabs { index, .. } => index,
        Target::Split {
            with: ItemRef::Tab(with),
            ..
        } => there
            .and_then(|browser| {
                let listed = tabs::listed(&browser);
                listed.iter().position(|each| each.id() == with)
            })
            .unwrap_or(0),
        _ => 0,
    };
    let inner = state.clone();
    state.move_to_space(mt, window, moving, space, index, move |moved| {
        done(moved.and_then(|browser| land(&inner, mt, &browser, &place, tab, item, target)));
    });
}

// The tabs that move with `tab` as `item`: its group's, its split's two, or
// itself.
fn moving(source: &Browser, tab: BrowserTab, item: ItemRef) -> Result<Vec<BrowserTab>, String> {
    let state = tab.state().map_err(failed)?;
    match (item, state.split) {
        (ItemRef::Group(_), _) => {
            let group = state.group.ok_or("The tab is in no group.")?;
            Ok(tabs::in_group(source, group))
        }
        (_, Some(split)) => tabs::in_split(split).map_err(failed),
        (_, None) => Ok(vec![tab]),
    }
}

// Whether `item`, of `count` tabs, may go to `target` at all: a group stays
// in the list, and only a lone tab makes a split.
fn may_land(item: ItemRef, count: usize, target: Target) -> Result<(), String> {
    match (item, target) {
        (ItemRef::Group(_), Target::Tabs { .. }) => Ok(()),
        (ItemRef::Group(_), _) => Err("A group stays in the list.".into()),
        (_, Target::Split { .. }) if count != 1 => {
            Err("Only a tab alone makes a split with another.".into())
        }
        _ => Ok(()),
    }
}

// Puts `tab`, a tab of `browser` (the Browser of `place`), or its split or
// its group as `item` says, at `target`. Its split and its group are read
// now: either may be a new one once it has come from another Browser.
fn land(
    state: &State,
    mt: MainThread,
    browser: &Browser,
    place: &Place,
    tab: BrowserTab,
    item: ItemRef,
    target: Target,
) -> Result<Moved, String> {
    let now = tab.state().map_err(failed)?;
    let pin = |target, index| {
        pins::pin_tab(state, browser, place, tab, target, index).map(|_| Moved::Pinned(target))
    };
    match target {
        Target::Tabs { group, index } => {
            let moved = match (item, now.split) {
                (ItemRef::Group(_), _) => {
                    let group = now.group.ok_or("The tab is in no group.")?;
                    tabs::move_group(browser, group, index)
                }
                (_, Some(split)) => {
                    let group = group_of(mt, browser, group)?;
                    tabs::move_split(mt, browser, split, index, group)
                }
                (_, None) => {
                    let group = group_of(mt, browser, group)?;
                    tabs::move_tab(mt, browser, tab, index, group)
                }
            };
            moved.map_err(failed)?;
            Ok(Moved::Placed)
        }
        Target::Favorites { index } => pin(PinTarget::Favorites, index),
        Target::Pinned { folder, index } => pin(PinTarget::Space { parent: folder }, index),
        Target::Split {
            with: ItemRef::Tab(with),
            side,
        } => {
            let with = tab_of(mt, browser, with)?;
            let (first, second) = match side {
                Side::Left => (tab, with),
                Side::Right => (with, tab),
            };
            tabs::split(first, second).map_err(failed)?;
            Ok(Moved::Split { pin: false })
        }
        Target::Split {
            with: ItemRef::Pin(with),
            side,
        } => {
            let side = match side {
                Side::Left => 0,
                Side::Right => 1,
            };
            pins::split_with(state, browser, place, with, tab, side)?;
            Ok(Moved::Split { pin: true })
        }
        Target::Split {
            with: ItemRef::Group(_),
            ..
        } => Err("A tab makes no split with a group.".into()),
    }
}

// The place of window `window` that `space` names, or its own in front.
fn place_of(state: &State, window: WindowId, space: Option<SpaceId>) -> Result<Place, String> {
    match space {
        Some(space) => Ok(Place::Space(space)),
        None => state
            .windows
            .get(window)
            .ok_or("The window is closing.")?
            .place()
            .ok_or_else(|| "The window is on no space.".into()),
    }
}

// Calls `then` with the Browser window `window` has for `place`, making it
// one first if it has none, or with why it has none.
fn with_browser(
    state: &Rc<State>,
    mt: MainThread,
    window: WindowId,
    place: Place,
    then: impl FnOnce(Result<Browser, String>) + 'static,
) {
    let Some(found) = state.windows.get(window) else {
        return then(Err("The window is closing.".into()));
    };
    if let Some(browser) = found.browser_of(&place) {
        return then(Ok(browser));
    }
    if found.is_opening(&place) {
        return then(Err("That space is still opening.".into()));
    }
    let inner = state.clone();
    state.open_browser(mt, window, place.clone(), move || {
        let browser = inner.windows.get(window).and_then(|w| w.browser_of(&place));
        then(browser.ok_or_else(|| "The space has no Browser.".to_owned()));
    });
}

// The tab an ID from the page names, if it is `browser`'s.
fn tab_of(mt: MainThread, browser: &Browser, id: i32) -> Result<BrowserTab, String> {
    BrowserTab::from_id(mt, id)
        .filter(|tab| tab.browser().as_ref() == Some(browser))
        .ok_or_else(|| "There is no such tab.".into())
}

// The group of the tab the page names, if it names one: the group an item
// is to be in.
fn group_of(
    mt: MainThread,
    browser: &Browser,
    member: Option<i32>,
) -> Result<Option<TabGroup>, String> {
    let Some(member) = member else {
        return Ok(None);
    };
    let state = tab_of(mt, browser, member)?.state().map_err(failed)?;
    Ok(Some(state.group.ok_or("The tab is in no group.")?))
}

fn failed(error: wren::Error) -> String {
    format!("{error:?}")
}
