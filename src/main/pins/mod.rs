// Pins: tabs, splits and folders the user keeps, drawn as favourites (a
// profile's, which each of its spaces shows) or as a space's pins. They are
// kept in the app's database (db/pins.rs), not as Chromium's bookmarks.
//
// A pin opens in place: a tab of the window's Browser claims it
// (tabs/roles.rs), which pins the tab in Chromium's sense so it is never in
// the list's order, and the sidebar draws the tab on the pin's row. A pin
// and its tab are one: the tab may navigate away and come back, and closing
// it leaves the pin unopened, while removing the pin closes it. What an
// open pin keeps, and its tabs in a Browser, are in open.rs, and the pins
// are settled as Chromium changes their tabs in settle.rs. A pin's tab
// never lasts: it is kept out of Chromium's session, so a restore brings
// none back.

mod open;
mod settle;

pub use settle::settle;

use std::rc::Rc;

use wren::{Browser, BrowserTab, Error, MainThread, SplitLayout, SplitState, TabGroup};

use crate::app::State;
use crate::db::{NewPin, PinId, PinKind, PinLayout, PinPage, PinPlace, PinRow, SpaceId};
use crate::shell::{BrowserWindow, Place};
use crate::tabs;
use crate::tabs::roles;

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
/// it is open there, or else opens it there, in a tab that claims it. A
/// split pin opens its two pages as a split.
pub fn open(state: &State, browser: &Browser, place: &Place, id: PinId) -> Result<(), String> {
    let pin = pin_for(state, place, id)?;
    let open = open::opening(browser, id).and_then(|opening| opening.tabs().first().copied());
    if let Some(tab) = open {
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
/// row does, or the pin on half of the tab's: `tab` leaves the list, and the
/// two open as the pin's split, where the pin is kept. An unopened pin opens
/// first.
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
    state.open_browser(mt, window, place, move || {
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

/// Takes the open pin's tab on `side` back to the pin's page, and selects it.
pub fn back(browser: &Browser, id: PinId, side: usize) -> Result<(), String> {
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
        .filter_map(|opening| {
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
        })
        .collect()
}

/// Makes the pages of the open pin's tabs in `browser` that are away the
/// pin's own: it keeps where they are now, in every Browser it is open in.
pub fn update_url(state: &State, browser: &Browser, id: PinId) -> Result<(), String> {
    let open = open_pins(browser)
        .into_iter()
        .find(|open| open.pin == id)
        .ok_or("That pin is not open.")?;
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

/// Closes the open pin's tabs, all or none, leaving the pin unopened. Each
/// page may ask first, and if one keeps its tab, every tab stays open and
/// the pin stays as it was. The tabs keep their claims until they have gone
/// (`end_broken` in settle.rs), marked as closing.
pub fn close(browser: &Browser, id: PinId) -> Result<(), String> {
    let Some(opening) = open::opening(browser, id) else {
        return Ok(());
    };
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

/// Deletes pin `id`, and what is in it, closing their tabs in every window.
pub fn delete(state: &State, id: PinId) -> Result<(), String> {
    let deleted = state.db.delete_pin(id)?;
    close_where(state, &deleted, |_, _| true);
    crate::ipc::broadcast_pins(state);
    Ok(())
}

/// Moves pin `id` to `target` of the window on `place`, at `index` (None:
/// last). A favourite that becomes a space's pin is closed in the Browsers
/// of the other spaces, which no longer show it.
pub fn move_pin(
    state: &State,
    place: &Place,
    id: PinId,
    target: PinTarget,
    index: Option<usize>,
) -> Result<(), String> {
    let to = target.resolve(state, place)?;
    state.db.move_pin(id, &to, index)?;
    open::moved(state, id);
    if let PinPlace::Space { space, .. } = to {
        close_where(state, &[id], |window, browser| {
            window.space_of(browser) != Some(space)
        });
    }
    crate::ipc::broadcast_pins(state);
    Ok(())
}

/// Makes pin `id` an ordinary tab at `index` of the list, in `group`, and
/// removes the pin: its tab in `browser` stays, unpinned (a split's two
/// still a split), or, unopened, opens there. Its tabs elsewhere close with
/// it.
pub fn to_list(
    state: &State,
    mt: MainThread,
    browser: &Browser,
    place: &Place,
    id: PinId,
    index: usize,
    group: Option<TabGroup>,
) -> Result<(), String> {
    let pin = pin_for(state, place, id)?;
    let open = open::opening(browser, id).map_or_else(Vec::new, |opening| opening.tabs());
    match (pin.kind, open.as_slice()) {
        (PinKind::Tab(_), [tab]) => {
            roles::release(*tab);
            tabs::move_tab(mt, browser, *tab, index, group).map_err(failed)?;
        }
        (PinKind::Tab(page), _) => {
            tabs::add_at(mt, browser, &page.url, index, group, true).map_err(failed)?;
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
        }
        (PinKind::Folder { .. }, _) => return Err("A folder can't be a tab.".into()),
    }
    // Its tabs here are the list's now, and those elsewhere close with it.
    delete(state, id)
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

// Pin `id`, as the window on `place` may open it: a favourite of the place's
// profile, or a pin of its space.
fn pin_for(state: &State, place: &Place, id: PinId) -> Result<PinRow, String> {
    let (profile, space, pin) = state.db.pin(id)?.ok_or("That pin is gone.")?;
    let fits = match (space, place) {
        (Some(space), Place::Space(shown)) => space == *shown,
        (None, Place::Space(shown)) => state
            .db
            .space(*shown)?
            .is_some_and(|row| row.profile == profile),
        (
            None,
            Place::Profile {
                id,
                off_the_record: false,
            },
        ) => *id == profile,
        _ => false,
    };
    if fits {
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
