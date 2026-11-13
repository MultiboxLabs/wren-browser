// What a drop in the sidebar does. Everything the sidebar draws is an item: a
// tab of the list (or its split), a group, or a pin (pins/), which is a
// pinned tab, a favourite or a folder. The page says which item goes where
// (ipc/items.rs), and this decides what that means: a move in the list, into
// a group or out of one, pinning, unpinning, a move among the pins, a
// split, or a group kept as a folder. It is the one place that knows which
// item may go where, and calls tabs/ and pins/ for each.
//
// An item of the list that is in another of the window's spaces, or in
// another window, moves to the destination's Browser first
// (windows/move_tabs.rs), then lands as one of its own would. A drop from
// another window names its tabs and groups by their tokens (carry.rs).
//
// Several tabs of the list that are marked move together, or several
// pinned tabs (together.rs), each as it would alone, one after another.
//
// What an item's menu does is in menu.rs. Keeping a tab from there is a
// move here.

pub mod carry;
pub mod menu;
mod together;

use std::rc::Rc;

use serde::Deserialize;
use wren::{Browser, BrowserTab, MainThread, TabGroup};

use crate::app::State;
use crate::db::{PinId, SpaceId};
use crate::pins::{self, PinTarget};
use crate::shell::{Place, WindowId};
use crate::tabs;

/// An item, as the page names it: a tab of the list, which stands for its
/// split if it is in one; a group, by its ID, which Chromium keeps as the
/// group moves, to another Browser too; or a pin.
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ItemRef {
    Tab(i32),
    Group(String),
    Pin(PinId),
}

// An item of the list, found: a tab, which stands for its split if it is in
// one, or a group.
#[derive(Clone, Copy, PartialEq, Eq, Hash)]
enum Listed {
    Tab(BrowserTab),
    Group(TabGroup),
}

impl Listed {
    // The Browser it is in; none once it has gone.
    fn browser(self) -> Option<Browser> {
        match self {
            Listed::Tab(tab) => tab.browser(),
            Listed::Group(group) => group.browser(),
        }
    }

    // As the page names it.
    fn item(self) -> ItemRef {
        match self {
            Listed::Tab(tab) => ItemRef::Tab(tab.id()),
            Listed::Group(group) => ItemRef::Group(group.to_string()),
        }
    }
}

/// Where an item goes: a place in the sidebar of `space`, or of the window's
/// own place if it names none, as a window on a profile does.
#[derive(Clone, Debug, Deserialize)]
pub struct Destination {
    pub space: Option<SpaceId>,
    #[serde(flatten)]
    pub target: Target,
}

/// A place in a sidebar.
#[derive(Clone, Debug, Deserialize)]
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
    /// (`tabs::listed`), in the group of the ID `group`, or in none.
    Tabs { group: Option<String>, index: usize },
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
    /// A group became a folder of the pins.
    Folder,
}

const NO_PLACE_FOR_GROUP: &str = "A group goes only to the list or the pins.";

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
        ItemRef::Tab(_) | ItemRef::Group(_) => {
            move_listed(state, mt, window, place, item, to.target, done)
        }
    }
}

/// Moves `items` to `to` in window `window`, then calls `done` with what
/// each move did, or why they did not move. One item moves as `move_item`
/// moves it. Several, which are all tabs of the list or all pinned tabs,
/// land together from the place `to` names, in the order they are given:
/// where one of them may not go, none go.
pub fn move_items(
    state: &Rc<State>,
    mt: MainThread,
    window: WindowId,
    mut items: Vec<ItemRef>,
    to: Destination,
    done: impl FnOnce(Result<Vec<Moved>, String>) + 'static,
) {
    if items.len() != 1 {
        return together::move_together(state, mt, window, items, to, Box::new(done));
    }
    let Some(item) = items.pop() else { return };
    move_item(state, mt, window, item, to, |moved| {
        done(moved.map(|moved| vec![moved]));
    });
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
    let pin =
        |target, index| pins::add_address(state, &place, &url, target, index).map(|_| Added::Pin);
    match to.target {
        Target::Favorites { index } => done(pin(PinTarget::Favorites, index)),
        Target::Pinned { folder, index } => done(pin(PinTarget::Space { parent: folder }, index)),
        Target::Tabs { group, index } => with_browser(state, mt, window, place, move |browser| {
            done(browser.and_then(|browser| {
                let group = group_of(mt, &browser, group.as_deref())?;
                tabs::open_at(mt, &browser, &url, index, group).map_err(failed)?;
                Ok(Added::Tab)
            }));
        }),
        Target::Split { .. } => done(Err("An address makes no split.".into())),
    }
}

// A pin goes among the pins or the favourites as it is, and to the list as
// an ordinary tab. The database refuses a folder in the favourites. A tab
// pin dropped on half of a tab of the list takes that tab as its split's
// other side, and stays where it is kept.
fn move_pin(
    state: &Rc<State>,
    mt: MainThread,
    window: WindowId,
    place: Place,
    id: PinId,
    target: Target,
    done: impl FnOnce(Result<Moved, String>) + 'static,
) {
    let among =
        |target, index| pins::move_pin(state, &place, id, target, index).map(|()| Moved::Placed);
    match target {
        Target::Favorites { index } => done(among(PinTarget::Favorites, index)),
        Target::Pinned { folder, index } => done(among(PinTarget::Space { parent: folder }, index)),
        Target::Tabs { group, index } => {
            let (inner, to) = (state.clone(), place.clone());
            with_browser(state, mt, window, place, move |browser| {
                done(browser.and_then(|browser| {
                    let group = group_of(mt, &browser, group.as_deref())?;
                    pins::to_list(&inner, mt, &browser, &to, id, index, group)?;
                    Ok(Moved::Unpinned)
                }));
            });
        }
        Target::Split {
            with: ItemRef::Tab(with),
            side,
        } => done((|| {
            let found = state.windows.get(window).ok_or("The window is closing.")?;
            let browser = found.browser_of(&place).ok_or("There is no such tab.")?;
            let tab = tab_of(mt, &browser, with)?;
            if tab.state().map_err(failed)?.split.is_some() {
                return Err("A pin makes a split only with a tab alone.".into());
            }
            // The pin's page takes the half it was dropped on, and the tab
            // the other.
            let side = match side {
                Side::Left => 1,
                Side::Right => 0,
            };
            pins::split_with(state, &browser, &place, id, tab, side)?;
            Ok(Moved::Split { pin: true })
        })()),
        Target::Split { .. } => done(Err(
            "A pin makes a split only with a tab of the list.".into()
        )),
    }
}

// A tab of the list, its split or a group, of any window: it lands in its
// own Browser at once, or moves to the destination's first.
fn move_listed(
    state: &Rc<State>,
    mt: MainThread,
    window: WindowId,
    place: Place,
    item: ItemRef,
    target: Target,
    done: impl FnOnce(Result<Moved, String>) + 'static,
) {
    let found = (|| {
        let found = state.windows.get(window).ok_or("The window is closing.")?;
        let (listed, source) = listed(mt, &item)?;
        if state.windows.of(&source).is_none() {
            return Err("There is no such item.".to_owned());
        }
        let moving = moving(&source, listed)?;
        may_land(listed, moving.len(), &target)?;
        Ok((listed, source, moving, found.browser_of(&place)))
    })();
    let (listed, source, moving, there) = match found {
        Ok(found) => found,
        Err(error) => return done(Err(error)),
    };
    if there.as_ref() == Some(&source) {
        return done(land(state, mt, &source, &place, listed, target));
    }
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
    state.move_to_place(mt, window, moving, place.clone(), index, move |moved| {
        done(moved.and_then(|browser| land(&inner, mt, &browser, &place, listed, target)));
    });
}

// The item of a list the page names, and the Browser it is in.
fn listed(mt: MainThread, item: &ItemRef) -> Result<(Listed, Browser), String> {
    match item {
        ItemRef::Tab(id) => {
            let tab = BrowserTab::from_id(mt, *id).ok_or("There is no such tab.")?;
            let source = tab.browser().ok_or("There is no such tab.")?;
            Ok((Listed::Tab(tab), source))
        }
        ItemRef::Group(id) => {
            let group = TabGroup::parse(mt, id).ok_or("There is no such group.")?;
            let source = group.browser().ok_or("There is no such group.")?;
            Ok((Listed::Group(group), source))
        }
        ItemRef::Pin(_) => Err("A pin is not of the list.".into()),
    }
}

// The tabs that move as `item`: a group's, a tab's split's two, or the tab
// itself.
fn moving(source: &Browser, item: Listed) -> Result<Vec<BrowserTab>, String> {
    match item {
        Listed::Group(group) => Ok(tabs::in_group(source, group)),
        Listed::Tab(tab) => match tab.state().map_err(failed)?.split {
            Some(split) => tabs::in_split(split).map_err(failed),
            None => Ok(vec![tab]),
        },
    }
}

// Whether `item`, of `count` tabs, may go to `target` at all: a group to
// the list or the pins, and only a lone tab makes a split.
fn may_land(item: Listed, count: usize, target: &Target) -> Result<(), String> {
    match (item, target) {
        (Listed::Group(_), Target::Tabs { .. } | Target::Pinned { .. }) => Ok(()),
        (Listed::Group(_), _) => Err(NO_PLACE_FOR_GROUP.into()),
        (_, Target::Split { .. }) if count != 1 => {
            Err("Only a tab alone makes a split with another.".into())
        }
        _ => Ok(()),
    }
}

// Puts `item`, of `browser` (the Browser of `place`), at `target`: a group,
// or a tab with its split. A tab's split is read now, as it is a new one once
// the tab has come from another Browser. A group comes with its ID.
fn land(
    state: &State,
    mt: MainThread,
    browser: &Browser,
    place: &Place,
    item: Listed,
    target: Target,
) -> Result<Moved, String> {
    let tab = match item {
        Listed::Tab(tab) => tab,
        Listed::Group(group) => return land_group(state, browser, place, group, target),
    };
    let now = tab.state().map_err(failed)?;
    let pin = |target, index| {
        pins::pin_tab(state, browser, place, tab, target, index).map(|_| Moved::Pinned(target))
    };
    match target {
        Target::Tabs { group, index } => {
            let group = group_of(mt, browser, group.as_deref())?;
            let moved = match now.split {
                Some(split) => tabs::move_split(mt, browser, split, index, group),
                None => tabs::move_tab(mt, browser, tab, index, group),
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

// Puts `group`, of `browser`, at `target`: a place in the list, outside any
// group, or among the pins, where it is kept as a folder of pinned tabs.
fn land_group(
    state: &State,
    browser: &Browser,
    place: &Place,
    group: TabGroup,
    target: Target,
) -> Result<Moved, String> {
    if group.browser().as_ref() != Some(browser) {
        return Err("The group did not come to the space.".into());
    }
    match target {
        Target::Tabs { index, .. } => {
            tabs::move_group(browser, group, index).map_err(failed)?;
            Ok(Moved::Placed)
        }
        Target::Pinned { folder, index } => {
            pins::keep_group(state, browser, place, group, folder, index)?;
            Ok(Moved::Folder)
        }
        _ => Err(NO_PLACE_FOR_GROUP.into()),
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

// The group the page names, if it names one: the group an item is to be in.
fn group_of(
    mt: MainThread,
    browser: &Browser,
    id: Option<&str>,
) -> Result<Option<TabGroup>, String> {
    let Some(id) = id else {
        return Ok(None);
    };
    let group = tabs::group(mt, browser, id).ok_or("There is no such group.")?;
    Ok(Some(group))
}

fn failed(error: wren::Error) -> String {
    format!("{error:?}")
}
