// Pins: tabs, splits and folders the user keeps, drawn as favourites (a
// profile's, which each of its spaces shows) or as a space's pins. They are
// kept in the app's database (db/pins.rs), not as Chromium's bookmarks.
//
// A pin opens in place: a tab of the window's Browser claims it
// (tabs/roles.rs), which pins the tab in Chromium's sense so it is never in
// the list's order, and the sidebar draws the tab on the pin's row. A pin
// and its tab are one: the tab may navigate away and come back, and closing
// it leaves the pin unopened, while removing the pin closes it. A window has
// one tab for each pin: a favourite's moves to whichever of the window's
// spaces opens it (`bring`), and other windows have their own. What an
// open pin keeps, and its tabs in a Browser, are in open.rs, and the pins
// are settled as Chromium changes their tabs in settle.rs. A pin's tab
// never lasts: it is kept out of Chromium's session, so a restore brings
// none back.

mod open;
mod settle;

pub use settle::settle;

use std::rc::Rc;

use wren::{Browser, BrowserTab, Error, MainThread, SplitLayout, SplitState, TabGroup};

use crate::analytics::{self, Event};
use crate::app::State;
use crate::db::{NewPin, PinId, PinKind, PinLayout, PinPage, PinPlace, PinRow, SpaceId};
use crate::tabs;
use crate::tabs::roles;
use crate::windows::{self, BrowserWindow, Place};

const FOLDER_IS_NO_TAB: &str = "A folder can't be a tab.";

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
            (PinTarget::Favorites, _) => {
                let profile = profile_of(state, place)?.ok_or("That space is gone.")?;
                Ok(PinPlace::Favorites { profile })
            }
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

/// Makes `tab` a pin of `place`, at `index` (None: last), which it claims:
/// the tab leaves the list and is drawn as the pin. A tab in a split goes with
/// the other, as one split pin. Answers the pin's ID.
pub fn pin_tab(
    state: &State,
    browser: &Browser,
    place: &Place,
    tab: BrowserTab,
    target: PinTarget,
    index: Option<usize>,
) -> Result<PinId, String> {
    let to = target.resolve(state, place)?;
    let split = tabs::split_of(tab).and_then(|split| Some((split, split.state().ok()?)));
    let id = match split {
        Some((
            split,
            SplitState {
                first: Some(first),
                second: Some(second),
                layout,
                ratio,
            },
        )) => {
            let pin = NewPin::Split {
                first: page_of(first),
                second: page_of(second),
                layout: pin_layout(layout),
                ratio,
            };
            let id = state.db.create_pin(&to, index, pin)?;
            split.unsplit().map_err(failed)?;
            let sides = vec![(first, page_of(first)), (second, page_of(second))];
            open::link(state, browser, id, sides, Some((layout, ratio))).map_err(failed)?;
            id
        }
        _ => {
            let id = state.db.create_pin(&to, index, NewPin::Tab(page_of(tab)))?;
            open::link(state, browser, id, vec![(tab, page_of(tab))], None).map_err(failed)?;
            id
        }
    };
    crate::ipc::broadcast_pins(state);
    Ok(id)
}

/// Makes an unopened pin of `place` on an address dropped on the sidebar,
/// at `index` (None: last). It goes by the address until it is first open
/// on its page (`keep_look`).
pub fn add_address(
    state: &State,
    place: &Place,
    url: &str,
    target: PinTarget,
    index: Option<usize>,
) -> Result<PinId, String> {
    if !tabs::is_droppable(url) {
        return Err("Only a web address or a file's can be pinned.".into());
    }
    let to = target.resolve(state, place)?;
    let page = PinPage {
        url: url.into(),
        title: url.into(),
        favicon: None,
    };
    let id = state.db.create_pin(&to, index, NewPin::Tab(page))?;
    crate::ipc::broadcast_pins(state);
    Ok(id)
}

/// Makes a folder named "New Folder" among a space's pins, as the user asks
/// for one, and answers its ID.
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
    let kind = analytics::PinKind::Folder;
    state.analytics.record(Event::PinAdded { kind });
    Ok(id)
}

/// Names pin `id`; with none, or nothing but spaces, its page's title names
/// it again.
pub fn rename(state: &State, id: PinId, name: Option<&str>) -> Result<(), String> {
    state.db.rename_pin(id, name)?;
    crate::ipc::broadcast_pins(state);
    Ok(())
}

/// Opens folder `id`, or closes it.
pub fn set_folder_open(state: &State, id: PinId, open: bool) -> Result<(), String> {
    state.db.set_folder_open(id, open)?;
    crate::ipc::broadcast_pins(state);
    Ok(())
}

/// Makes `group`, of `browser`'s list, a folder among the pins of the space
/// of `place`, in `parent` at `index` (None: last), and answers the folder's
/// ID. The folder takes the group's title, or "New Folder" for an untitled
/// one, and the group's tabs are pinned into it in their order, a split as
/// one split pin. The group ends as its last tab is pinned, and its colour
/// with it, as a folder has none. A folded group makes a folded folder.
pub fn keep_group(
    state: &State,
    browser: &Browser,
    place: &Place,
    group: TabGroup,
    parent: Option<PinId>,
    index: Option<usize>,
) -> Result<PinId, String> {
    let to = PinTarget::Space { parent }.resolve(state, place)?;
    let grouped = tabs::in_group(browser, group);
    let folded = group.visuals().is_ok_and(|(_, collapsed)| collapsed);
    let name = match group.title() {
        title if !title.trim().is_empty() => title,
        _ => "New Folder".into(),
    };
    let folder = state.db.create_pin(&to, index, NewPin::Folder { name })?;
    let inside = PinTarget::Space {
        parent: Some(folder),
    };
    for tab in grouped {
        // A split's second tab was pinned with its first.
        if roles::pin_of(tab).is_none() {
            pin_tab(state, browser, place, tab, inside, None)?;
        }
    }
    if folded {
        state.db.set_folder_open(folder, false)?;
    }
    crate::ipc::broadcast_pins(state);
    Ok(folder)
}

/// The pins of `place`, in order: a profile's favourites, or those at the
/// top of a space's pins or in one of its folders.
pub fn siblings(state: &State, place: &PinPlace) -> Result<Vec<PinId>, String> {
    let rows = match place {
        PinPlace::Favorites { profile } => state.db.favorites(profile)?,
        PinPlace::Space { space, parent } => {
            let all = state.db.space_pins(*space)?;
            match parent {
                Some(folder) => in_folder(all, *folder).ok_or("That folder is gone.")?,
                None => all,
            }
        }
    };
    Ok(rows.into_iter().map(|row| row.id).collect())
}

// What is in `folder`, which is among `rows` or in a folder of them.
fn in_folder(rows: Vec<PinRow>, folder: PinId) -> Option<Vec<PinRow>> {
    rows.into_iter().find_map(|row| match row.kind {
        PinKind::Folder { items, .. } if row.id == folder => Some(items),
        PinKind::Folder { items, .. } => in_folder(items, folder),
        _ => None,
    })
}

/// Opens pin `id` in `browser`, the window's on `place`: selects its tab if
/// it is open there or in another space of the window, which it moves here
/// from (`bring`), or else opens it there, in a tab that claims it. A split
/// pin opens its two pages as a split.
pub fn open(state: &State, browser: &Browser, place: &Place, id: PinId) -> Result<(), String> {
    let pin = pin_for(state, place, id)?;
    if let Some(tab) = bring(state, browser, id, true)? {
        return tab.activate().map_err(failed);
    }
    match pin.kind {
        PinKind::Tab(page) => {
            let tab = browser.add_tab(&page.url, None, true).map_err(failed)?;
            open::link(state, browser, id, vec![(tab, page)], None).map_err(failed)?;
        }
        PinKind::Split {
            first,
            second,
            layout,
            ratio,
        } => {
            let one = browser.add_tab(&first.url, None, true).map_err(failed)?;
            let two = browser.add_tab(&second.url, None, false).map_err(failed)?;
            let split = Some((split_layout(layout), ratio));
            let sides = vec![(one, first), (two, second)];
            if let Err(error) = open::link(state, browser, id, sides, split) {
                let _ = tabs::close(browser, &[one, two]);
                return Err(failed(error));
            }
        }
        PinKind::Folder { .. } => return Err("A folder does not open.".into()),
    }
    Ok(())
}

/// Makes tab pin `id` a split of its page and `tab`'s, `tab` on `side` (0:
/// first), side by side, as a tab of the list dropped on half of the pin's
/// row does: `tab` leaves the list, and the two open as the pin's split,
/// where the pin is kept. An unopened pin opens first. The pin dropped on
/// half of the tab's row goes to the list instead (`split_in_list`).
pub fn split_with(
    state: &State,
    browser: &Browser,
    place: &Place,
    id: PinId,
    tab: BrowserTab,
    side: usize,
) -> Result<(), String> {
    if !matches!(pin_for(state, place, id)?.kind, PinKind::Tab(_)) {
        return Err("Only a tab pin makes a split with a tab.".into());
    }
    if roles::pin_of(tab).is_some() {
        return Err("That tab is a pin's.".into());
    }
    open(state, browser, place, id)?;
    let own = open::opening(browser, id)
        .and_then(|opening| opening.tabs().first().copied())
        .ok_or("The pin did not open.")?;
    let kept = open::kept(id).and_then(|kept| kept.pages.first().cloned());
    let own_page = kept.ok_or("The pin did not open.")?;
    let page = page_of(tab);
    if tab.state().is_ok_and(|state| state.split.is_some()) {
        unsplit(tab)?;
    }
    state.db.tab_to_split(id, side, &page)?;
    let sides = match side {
        0 => vec![(tab, page), (own, own_page)],
        _ => vec![(own, own_page), (tab, page)],
    };
    // Should the two not make a split, the pin's tabs are no longer whole,
    // and it becomes a tab pin again as it is settled (settle.rs).
    let split = Some((SplitLayout::SideBySide, 0.5));
    let linked = open::link(state, browser, id, sides, split);
    crate::ipc::broadcast_pins(state);
    linked.map_err(failed)?;
    tab.activate().map_err(failed)
}

/// Opens pin `id` in `window`, as `open` does in its Browser; a place
/// without a Browser gets one first, as the omnibox's does. `done` hears how
/// it went.
pub fn open_in(
    state: &Rc<State>,
    mt: MainThread,
    window: &BrowserWindow,
    id: PinId,
    done: impl FnOnce(Result<(), String>) + 'static,
) {
    let Some(place) = window.place() else {
        return done(Err("The window is on no space.".into()));
    };
    if let Some(browser) = window.browser() {
        return done(open(state, &browser, &place, id));
    }
    let (inner, window) = (state.clone(), window.id);
    windows::open_browser(state, mt, window, place, move || {
        let opened = inner
            .windows
            .get(window)
            .and_then(|window| Some((window.browser()?, window.place()?)))
            .ok_or_else(|| "The window has no Browser.".to_string())
            .and_then(|(browser, place)| open(&inner, &browser, &place, id));
        done(opened);
    });
}

/// Opens the favourite at `index` of those `window` shows, or selects its
/// tab, as ⌘1 to ⌘9 do. Past the last, nothing.
pub fn open_favorite(state: &Rc<State>, mt: MainThread, window: &BrowserWindow, index: usize) {
    let Some(place) = window.place() else {
        return;
    };
    let favorites = PinTarget::Favorites
        .resolve(state, &place)
        .and_then(|found| match found {
            PinPlace::Favorites { profile } => state.db.favorites(&profile),
            PinPlace::Space { .. } => Ok(Vec::new()),
        });
    let Some(favorite) = favorites.ok().and_then(|all| all.into_iter().nth(index)) else {
        return;
    };
    open_in(state, mt, window, favorite.id, |opened| {
        if let Err(error) = opened {
            eprintln!("Wren opened no favourite: {error}");
        }
    });
}

/// Moves the pin's tabs to `browser` from another Browser of its window
/// that has them, shown there if `activate`, and answers its first tab;
/// None if the window has the pin open nowhere. A favourite has one tab in
/// a window, which moves to the space that opens it.
fn bring(
    state: &State,
    browser: &Browser,
    id: PinId,
    activate: bool,
) -> Result<Option<BrowserTab>, String> {
    let Some((from, opening)) = open::opening_near(state, browser, id) else {
        return Ok(None);
    };
    let tabs = opening.tabs();
    if from != *browser {
        tabs::move_here(browser, &tabs, activate).map_err(failed)?;
    }
    Ok(tabs.first().copied())
}

/// Takes the open pin's tab on `side` back to the pin's page, and selects
/// it, moving the pin's tabs here from another space of the window first.
pub fn back(state: &State, browser: &Browser, id: PinId, side: usize) -> Result<(), String> {
    bring(state, browser, id, true)?;
    let opening = open::opening(browser, id).ok_or("That pin is not open.")?;
    let tab = opening.sides.get(side).copied().flatten();
    let tab = tab.ok_or("The pin's tab is gone.")?;
    let kept = open::kept(id).ok_or("That pin is not open.")?;
    let page = kept.pages.get(side).ok_or("The pin has no such side.")?;
    tab.navigate(&page.url).map_err(failed)?;
    tab.activate().map_err(failed)
}

/// A pin open in a Browser: its tabs, in its order, and whether each is
/// away from the pin's page.
pub struct OpenPin {
    pub pin: PinId,
    pub tabs: Vec<BrowserTab>,
    pub away: Vec<bool>,
}

/// The pins open in `browser`. One a tab of which has gone this moment is
/// left out; `settle` ends it.
pub fn open_pins(browser: &Browser) -> Vec<OpenPin> {
    open::openings(browser)
        .into_iter()
        .filter_map(open_pin_of)
        .collect()
}

/// Pin `id`, if it is open in `browser` or another Browser of its window,
/// as `open_pins` has it: what a window's menus act on, whichever of its
/// spaces has the pin's tab.
pub fn open_pin(state: &State, browser: &Browser, id: PinId) -> Option<OpenPin> {
    open_pin_of(open::opening_near(state, browser, id)?.1)
}

// An opening as `open_pins` has it, if it is whole.
fn open_pin_of(opening: open::Opening) -> Option<OpenPin> {
    let tabs = opening.whole()?;
    let kept = open::kept(opening.pin)?;
    let away = kept
        .pages
        .iter()
        .zip(&tabs)
        .map(|(page, tab)| is_away(&page.url, &tab.url()))
        .collect();
    Some(OpenPin {
        pin: opening.pin,
        tabs,
        away,
    })
}

/// Makes the pages of the open pin's tabs in `browser`'s window that are
/// away the pin's own: it keeps where they are now, in every Browser it is
/// open in.
pub fn update_url(state: &State, browser: &Browser, id: PinId) -> Result<(), String> {
    let open = open_pin(state, browser, id).ok_or("That pin is not open.")?;
    for (side, tab) in open.tabs.iter().enumerate() {
        if open.away[side] {
            open::set_page(state, id, side, &page_of(*tab))?;
        }
    }
    // Nothing of its tabs changed to tell the page they are home, in each
    // Browser the pin is open in.
    let mut told: Vec<Browser> = Vec::new();
    for (tab, _) in roles::claims_of(id) {
        let Some(each) = tab.browser().filter(|each| !told.contains(each)) else {
            continue;
        };
        if let Some(window) = state.windows.of(&each) {
            crate::ipc::send_tabs(&window, &each);
        }
        told.push(each);
    }
    crate::ipc::broadcast_pins(state);
    Ok(())
}

/// Closes the open pin's tabs in `browser`'s window, all or none, wherever
/// in it they are, leaving the pin unopened. Each page may ask first, and
/// if one keeps its tab, every tab stays open and the pin stays as it was.
/// The tabs keep their claims until they have gone (`end_broken` in
/// settle.rs), marked as closing.
pub fn close(state: &State, browser: &Browser, id: PinId) -> Result<(), String> {
    let Some((browser, opening)) = open::opening_near(state, browser, id) else {
        return Ok(());
    };
    let browser = &browser;
    if opening.closing {
        return Ok(());
    }
    let open = opening.tabs();
    tabs::placeholder::stand_in(browser, &open).map_err(failed)?;
    open::set_closing(browser, id, true);
    let kept = browser.clone();
    BrowserTab::close_all(&open, move |result| {
        let Err(error) = result else {
            return;
        };
        open::set_closing(&kept, id, false);
        if error != Error::Cancelled {
            eprintln!("Wren could not close a pin's tabs: {error:?}");
        }
    });
    Ok(())
}

/// Deletes pin `id`, and what is in it, as the user asks, closing their
/// tabs in every window.
pub fn delete(state: &State, id: PinId) -> Result<(), String> {
    remove(state, id)?;
    state.analytics.record(Event::PinDeleted);
    Ok(())
}

// Takes pin `id` away, and what is in it, closing their tabs in every
// window. It counts nothing, as a pin that goes back to the list goes this
// way too, and is counted as unpinned.
fn remove(state: &State, id: PinId) -> Result<(), String> {
    let deleted = state.db.delete_pin(id)?;
    close_where(state, &deleted, |_, _| true);
    crate::ipc::broadcast_pins(state);
    Ok(())
}

/// Moves pin `id` to `target` of the window on `place`, at `index` (None:
/// last), with all in it if it is a folder. Each pin that goes to a space's
/// pins of its profile, from the favourites or another space, keeps its tab
/// in each window that has that space's Browser, moved there from another
/// space if it is in one, and is closed in the Browsers of the other spaces,
/// which no longer show it. One that goes to another profile has its tabs
/// closed everywhere, and arrives unopened.
pub fn move_pin(
    state: &State,
    place: &Place,
    id: PinId,
    target: PinTarget,
    index: Option<usize>,
) -> Result<(), String> {
    let to = target.resolve(state, place)?;
    let crosses = goes_to_another_profile(state, place, id)?;
    let moved = state.db.move_pin(id, &to, index)?;
    for pin in &moved {
        open::moved(state, *pin);
    }
    if crosses {
        // No tab can go to another profile.
        close_where(state, &moved, |_, _| true);
    } else if let PinPlace::Space { space, .. } = to {
        for window in state.windows.all() {
            let Some(target) = window.browser_of(&Place::Space(space)) else {
                continue;
            };
            for pin in &moved {
                if let Err(error) = bring(state, &target, *pin, false) {
                    eprintln!("Wren could not keep a pin's tab as it went to a space: {error}");
                }
            }
        }
        close_where(state, &moved, |window, browser| {
            window.space_of(browser) != Some(space)
        });
    }
    crate::ipc::broadcast_pins(state);
    Ok(())
}

/// Whether pin `id` goes to another profile as it moves to the window on
/// `place`, which its tabs can't follow it to.
pub fn goes_to_another_profile(state: &State, place: &Place, id: PinId) -> Result<bool, String> {
    let (profile, _, _) = state.db.pin(id)?.ok_or("That pin is gone.")?;
    Ok(profile_of(state, place)?.as_deref() != Some(profile.as_str()))
}

/// Makes pin `id` an ordinary tab at `index` of the list, in `group`,
/// removes the pin, and returns its tabs in the list, in order. A pin the
/// window doesn't show comes to the top of its space's pins first
/// (`come_here`). Its tab in `browser`'s window, moved here from another
/// space if it is in one, stays, unpinned (a split's two still a split),
/// or, unopened, opens here. Its tabs in other windows close with it.
pub fn to_list(
    state: &State,
    mt: MainThread,
    browser: &Browser,
    place: &Place,
    id: PinId,
    index: usize,
    group: Option<TabGroup>,
) -> Result<Vec<BrowserTab>, String> {
    let pin = pin_row(state, id)?;
    // A folder stays where it is, rather than come here and then fail.
    if matches!(pin.kind, PinKind::Folder { .. }) {
        return Err(FOLDER_IS_NO_TAB.into());
    }
    come_here(state, place, id)?;
    bring(state, browser, id, false)?;
    let open = open::opening(browser, id).map_or_else(Vec::new, |opening| opening.tabs());
    let listed = match (pin.kind, open.as_slice()) {
        (PinKind::Tab(_), [tab]) => {
            roles::release(*tab);
            tabs::move_tab(mt, browser, *tab, index, group).map_err(failed)?;
            vec![*tab]
        }
        (PinKind::Tab(page), _) => {
            vec![tabs::add_at(mt, browser, &page.url, index, group, true).map_err(failed)?]
        }
        (PinKind::Split { .. }, [first, second]) => {
            // Out of their split as they are unpinned, as Chromium ends a
            // split one side of which is unpinned alone.
            let (layout, ratio) = unsplit(*first)?;
            roles::release(*first);
            roles::release(*second);
            let split = first.split_with(*second, layout).map_err(failed)?;
            split.set_ratio(ratio, false).map_err(failed)?;
            tabs::move_split(mt, browser, split, index, group).map_err(failed)?;
            vec![*first, *second]
        }
        (
            PinKind::Split {
                first,
                second,
                layout,
                ratio,
            },
            _,
        ) => {
            let one = tabs::add_at(mt, browser, &first.url, index, group, true);
            let two = tabs::add_at(mt, browser, &second.url, index + 1, group, false);
            let (one, two) = (one.map_err(failed)?, two.map_err(failed)?);
            one.split_with(two, split_layout(layout))
                .and_then(|split| split.set_ratio(ratio, false))
                .map_err(failed)?;
            vec![one, two]
        }
        (PinKind::Folder { .. }, _) => return Err(FOLDER_IS_NO_TAB.into()),
    };
    // Its tabs here are the list's now, and those elsewhere close with it.
    remove(state, id)?;
    Ok(listed)
}

/// Makes tab pin `id` an ordinary tab of the list in a split with `tab`, a
/// tab of the list alone, the pin's page on `side` (0: first), and removes
/// the pin, as the pin dropped on half of the tab's row does: it goes where
/// it is dropped. It lands as `to_list` puts it, beside `tab`.
pub fn split_in_list(
    state: &State,
    mt: MainThread,
    browser: &Browser,
    place: &Place,
    id: PinId,
    tab: BrowserTab,
    side: usize,
) -> Result<(), String> {
    let now = tab.state().map_err(failed)?;
    if now.split.is_some() {
        return Err("A pin makes a split only with a tab alone.".into());
    }
    let index = tabs::listed(browser).iter().position(|each| *each == tab);
    let index = index.ok_or("That tab is not in the list.")?;
    let own = tab_pin_to_list(state, mt, browser, place, id, index, now.group)?;
    let (first, second) = if side == 0 { (own, tab) } else { (tab, own) };
    tabs::split(first, second).map_err(failed)
}

/// Makes tab pin `target` a split pin with the page of tab pin `id`, on
/// `side` (0: first), and removes `id`, as `id` dropped on half of
/// `target`'s row does: it goes where it is dropped, and `target` keeps its
/// place and name. `id` comes to the list first, from any space (`to_list`),
/// and `target` takes its tab from there (`split_with`).
pub fn split_pins(
    state: &State,
    mt: MainThread,
    browser: &Browser,
    place: &Place,
    id: PinId,
    target: PinId,
    side: usize,
) -> Result<(), String> {
    if id == target {
        return Err("A pin makes no split with itself.".into());
    }
    if !matches!(pin_for(state, place, target)?.kind, PinKind::Tab(_)) {
        return Err("Only a tab pin makes a split.".into());
    }
    let own = tab_pin_to_list(state, mt, browser, place, id, 0, None)?;
    split_with(state, browser, place, target, own, side)
}

// Closes the tabs of `pins` in every Browser `closes` picks, each pin's
// all or none (`let_go`).
fn close_where(state: &State, pins: &[PinId], closes: impl Fn(&BrowserWindow, &Browser) -> bool) {
    for window in state.windows.all() {
        for browser in window.browsers() {
            if !closes(&window, &browser) {
                continue;
            }
            let going: Vec<Vec<BrowserTab>> = open::openings(&browser)
                .into_iter()
                .filter(|opening| pins.contains(&opening.pin))
                .map(|opening| opening.tabs())
                .collect();
            let all: Vec<BrowserTab> = going.iter().flatten().copied().collect();
            if all.is_empty() {
                continue;
            }
            if let Err(error) = tabs::placeholder::stand_in(&browser, &all) {
                eprintln!("Wren closed no pin's tabs: {error:?}");
                all.into_iter().for_each(roles::release);
                continue;
            }
            going.into_iter().for_each(let_go);
        }
    }
}

// Closes the tabs of a pin that has gone from their Browser, all or none.
// Until they have closed they are leaving (`Role::Leaving`): no sidebar
// draws them, as their pin has no row and they are not the list's. One
// whose page may ask first is a tab of the list at once, to be seen while
// it asks. If a page keeps its tab, they all stay, as tabs of the list.
fn let_go(tabs: Vec<BrowserTab>) {
    for tab in &tabs {
        if tabs::may_ask_before_close(*tab) {
            roles::release(*tab);
        } else {
            roles::leave(*tab);
        }
    }
    let kept = tabs.clone();
    BrowserTab::close_all(&tabs, move |result| {
        let Err(error) = result else {
            return;
        };
        kept.into_iter()
            .filter(|tab| tab.browser().is_some())
            .for_each(roles::release);
        if error != Error::Cancelled {
            eprintln!("Wren could not close a pin's tabs: {error:?}");
        }
    });
}

/// Whether a tab on `url` is away from a pin's page on `pinned`: on another
/// page, ignoring the fragment, `http` against `https`, and an empty path
/// against "/".
pub fn is_away(pinned: &str, url: &str) -> bool {
    same_page(pinned) != same_page(url)
}

fn same_page(url: &str) -> String {
    let url = url.split('#').next().unwrap_or_default();
    let Some(rest) = url
        .strip_prefix("https://")
        .or_else(|| url.strip_prefix("http://"))
    else {
        return url.to_owned();
    };
    let host = rest.find(['/', '?']).unwrap_or(rest.len());
    let (host, path) = rest.split_at(host);
    let slash = if path.starts_with('/') { "" } else { "/" };
    format!("https://{host}{slash}{path}")
}

// Takes the split `tab` is in apart, and answers its layout and ratio, to
// make it again.
fn unsplit(tab: BrowserTab) -> Result<(SplitLayout, f64), String> {
    let split = tabs::split_of(tab).ok_or("The tabs are in no split.")?;
    let state = split.state().map_err(failed)?;
    split.unsplit().map_err(failed)?;
    Ok((state.layout, state.ratio))
}

// The profile whose favourites and pins a window on `place` shows: its
// space's, or its own. None for an off-the-record side, which keeps none,
// or a space that has gone.
fn profile_of(state: &State, place: &Place) -> Result<Option<String>, String> {
    match place {
        Place::Space(space) => Ok(state.db.space(*space)?.map(|row| row.profile)),
        Place::Profile {
            id,
            off_the_record: false,
        } => Ok(Some(id.clone())),
        Place::Profile { .. } => Ok(None),
    }
}

// Brings pin `id` to the top of the pins of `place`'s space if the window
// doesn't show it, from another space of any profile, so that it lands in
// the list there as one of the space's own.
fn come_here(state: &State, place: &Place, id: PinId) -> Result<(), String> {
    let (profile, space, _) = state.db.pin(id)?.ok_or("That pin is gone.")?;
    if shows(state, place, &profile, space)? {
        return Ok(());
    }
    move_pin(state, place, id, PinTarget::Space { parent: None }, Some(0))
}

// Makes tab pin `id` an ordinary tab at `index` of the list, in `group`, as
// `to_list` does, and returns it, for a split to be made with it. Any other
// pin stays where it is.
fn tab_pin_to_list(
    state: &State,
    mt: MainThread,
    browser: &Browser,
    place: &Place,
    id: PinId,
    index: usize,
    group: Option<TabGroup>,
) -> Result<BrowserTab, String> {
    if !matches!(pin_row(state, id)?.kind, PinKind::Tab(_)) {
        return Err("Only a tab pin makes a split.".into());
    }
    match to_list(state, mt, browser, place, id, index, group)?[..] {
        [tab] => Ok(tab),
        _ => Err("The pin did not come to the list as one tab.".into()),
    }
}

// Pin `id`'s row, wherever it is kept.
fn pin_row(state: &State, id: PinId) -> Result<PinRow, String> {
    Ok(state.db.pin(id)?.ok_or("That pin is gone.")?.2)
}

// Whether the window on `place` shows a pin of `profile`, kept in `space`
// or, with none, among the favourites.
fn shows(
    state: &State,
    place: &Place,
    profile: &str,
    space: Option<SpaceId>,
) -> Result<bool, String> {
    Ok(match space {
        Some(space) => place.space() == Some(space),
        None => profile_of(state, place)?.as_deref() == Some(profile),
    })
}

// Pin `id`, as the window on `place` may open it: a favourite of the place's
// profile, or a pin of its space.
fn pin_for(state: &State, place: &Place, id: PinId) -> Result<PinRow, String> {
    let (profile, space, pin) = state.db.pin(id)?.ok_or("That pin is gone.")?;
    if shows(state, place, &profile, space)? {
        Ok(pin)
    } else {
        Err("That pin is not this window's.".into())
    }
}

fn pin_layout(layout: SplitLayout) -> PinLayout {
    match layout {
        SplitLayout::Stacked => PinLayout::Stacked,
        _ => PinLayout::SideBySide,
    }
}

fn split_layout(layout: PinLayout) -> SplitLayout {
    match layout {
        PinLayout::Stacked => SplitLayout::Stacked,
        PinLayout::SideBySide => SplitLayout::SideBySide,
    }
}

// `tab`'s page, as it is now.
fn page_of(tab: BrowserTab) -> PinPage {
    PinPage {
        url: tab.url(),
        title: tab.title(),
        favicon: tab.favicon_png(),
    }
}

fn failed(error: wren::Error) -> String {
    format!("{error:?}")
}

#[cfg(test)]
mod tests {
    use super::is_away;

    #[test]
    fn away_is_another_page_of_any_scheme_or_fragment() {
        assert!(!is_away("http://google.com", "https://google.com/#dawfaw"));
        assert!(!is_away("https://google.com/", "https://google.com"));
        assert!(!is_away(
            "https://mail.example.com/#inbox",
            "https://mail.example.com/#inbox/12"
        ));
        assert!(is_away("https://google.com/", "https://google.com/e"));
        assert!(is_away(
            "https://google.com/?q=a",
            "https://google.com/?q=b"
        ));
        assert!(is_away("https://google.com/", "https://www.google.com/"));
        assert!(!is_away("chrome://settings", "chrome://settings"));
        assert!(is_away("chrome://settings", "chrome://history"));
    }
}
