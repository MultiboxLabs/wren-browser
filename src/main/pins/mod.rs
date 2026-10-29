// Pins: tabs, splits and folders the user keeps, drawn as favourites (a
// profile's, which each of its spaces shows) or as a space's pins. They are
// kept in the app's database (db/pins.rs), not as Chromium's bookmarks.
//
// A pin opens in place: a tab of the window's Browser, pinned in Chromium's
// sense so it is never in the list's order, is linked to it (open_tabs.rs),
// and the pin is drawn as that tab. A pin and its tab are one: the tab may
// navigate away and come back, and closing it leaves the pin unopened, while
// removing the pin closes it. The links follow the tabs as Chromium changes
// them (tab_changes.rs). Linked tabs never last: a Browser Chromium brings
// back has its pinned tabs closed (`drop_restored`).

mod open_tabs;
mod tab_changes;

pub use open_tabs::{forget, pin_of};
pub use tab_changes::{drop_restored, follow_tab_changes};

use wren::{Browser, BrowserTab, MainThread, SplitLayout, SplitState, TabGroup, TabSplit};

use crate::app::State;
use crate::db::{NewPin, PinId, PinKind, PinLayout, PinPage, PinPlace, PinRow, SpaceId};
use crate::shell::{BrowserWindow, Place};
use crate::tabs;
use open_tabs::{Link, Side};

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

/// Makes `tab` a pin of `place`, at `index` (None: last), and links it: the
/// tab leaves the list and is drawn as the pin. A tab in a split goes with
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
    let split = tab
        .state()
        .ok()
        .and_then(|state| state.split)
        .and_then(|split| Some((split, split.state().ok()?)));
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
            split_pinned(first, second, layout, ratio, true)?;
            open_tabs::add(browser, link_now(id, &[first, second]));
            id
        }
        _ => {
            let id = state.db.create_pin(&to, index, NewPin::Tab(page_of(tab)))?;
            tab.set_pinned(true).map_err(failed)?;
            open_tabs::add(browser, link_now(id, &[tab]));
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

/// Opens pin `id` in `browser`, the window's on `place`: selects its tab if
/// it is open there, or else opens it there, linked. A split pin opens its
/// two pages as a split.
pub fn open(state: &State, browser: &Browser, place: &Place, id: PinId) -> Result<(), String> {
    let pin = pin_for(state, place, id)?;
    if let Some(tab) = open_tabs::find(browser, id).and_then(|link| tabs_of(browser, &link).next())
    {
        return tab.activate().map_err(failed);
    }
    match pin.kind {
        PinKind::Tab(page) => {
            let tab = browser.add_tab(&page.url, None, true).map_err(failed)?;
            tab.set_pinned(true).map_err(failed)?;
            open_tabs::add(browser, link_to(id, [(tab, page)]));
        }
        PinKind::Split {
            first,
            second,
            layout,
            ratio,
        } => {
            let one = browser.add_tab(&first.url, None, true).map_err(failed)?;
            let two = browser.add_tab(&second.url, None, false).map_err(failed)?;
            if let Err(error) = split_pinned(one, two, split_layout(layout), ratio, true) {
                let _ = tabs::close(browser, &[one, two]);
                return Err(error);
            }
            open_tabs::add(browser, link_to(id, [(one, first), (two, second)]));
        }
        PinKind::Folder { .. } => return Err("A folder does not open.".into()),
    }
    Ok(())
}

/// Takes the open pin's tab on `side` back to the pin's page, and selects it.
pub fn back(browser: &Browser, id: PinId, side: usize) -> Result<(), String> {
    let link = open_tabs::find(browser, id).ok_or("That pin is not open.")?;
    let side = link.sides.get(side).ok_or("The pin has no such side.")?;
    let tab = tab_with(browser, &side.tab).ok_or("The pin's tab is gone.")?;
    tab.navigate(&side.page.url).map_err(failed)?;
    tab.activate().map_err(failed)
}

/// A pin open in a Browser: its tabs, in its order, and whether each is
/// away from the pin's page.
pub struct OpenPin {
    pub pin: PinId,
    pub tabs: Vec<BrowserTab>,
    pub away: Vec<bool>,
}

/// The pins open in `browser`. A link whose tab has gone this moment is
/// left out; `follow_tab_changes` ends it.
pub fn open_pins(browser: &Browser) -> Vec<OpenPin> {
    let pinned: Vec<(String, BrowserTab)> = tabs::pinned(browser)
        .into_iter()
        .map(|tab| (tab.persistent_id(), tab))
        .collect();
    open_tabs::of(browser)
        .into_iter()
        .filter_map(|link| {
            let tabs: Vec<BrowserTab> = link
                .sides
                .iter()
                .map(|side| Some(pinned.iter().find(|(id, _)| *id == side.tab)?.1))
                .collect::<Option<_>>()?;
            let away = link
                .sides
                .iter()
                .zip(&tabs)
                .map(|(side, tab)| is_away(&side.page.url, &tab.url()))
                .collect();
            Some(OpenPin {
                pin: link.pin,
                tabs,
                away,
            })
        })
        .collect()
}

/// Whether pin `id` is open in `browser`.
pub fn is_open(browser: &Browser, id: PinId) -> bool {
    open_tabs::find(browser, id).is_some()
}

/// The sides of pin `id` open in `browser` whose tabs are away from its
/// pages; none if it is not open there.
pub fn away_sides(browser: &Browser, id: PinId) -> Vec<usize> {
    let open = open_pins(browser).into_iter().find(|open| open.pin == id);
    let away = open.map(|open| open.away).unwrap_or_default();
    (0..away.len()).filter(|side| away[*side]).collect()
}

/// Makes the pages of the open pin's tabs in `browser` that are away the
/// pin's own: it keeps where they are now, in every Browser it is open in.
pub fn update_url(state: &State, browser: &Browser, id: PinId) -> Result<(), String> {
    let open = open_pins(browser)
        .into_iter()
        .find(|open| open.pin == id)
        .ok_or("That pin is not open.")?;
    let mut updated = Vec::new();
    for (side, tab) in open.tabs.iter().enumerate() {
        if open.away[side] {
            let page = page_of(*tab);
            state.db.set_pin_page(id, side, &page)?;
            updated.push((side, page));
        }
    }
    for window in state.windows.all() {
        for each in window.browsers() {
            open_tabs::update(&each, id, |link| {
                for (side, page) in &updated {
                    if let Some(kept) = link.sides.get_mut(*side) {
                        kept.page = page.clone();
                    }
                }
            });
            // Nothing of its tabs changed to tell the page they are home.
            if window.browser().as_ref() == Some(&each) {
                crate::ipc::send_tabs(&window, &each);
            }
        }
    }
    crate::ipc::broadcast_pins(state);
    Ok(())
}

/// Closes the open pin's tabs, all of them, leaving the pin unopened. The
/// link ends first (`end_closing`): a split pin's first tab closing would
/// otherwise leave it a split broken, and `follow_tab_changes` would keep
/// the other side alone. Each tab is remembered as the pin's, for Reopen
/// Closed Tab (`relink`).
pub fn close(browser: &Browser, id: PinId) -> Result<(), String> {
    let Some(link) = open_tabs::end_closing(browser, id) else {
        return Ok(());
    };
    let open: Vec<BrowserTab> = tabs_of(browser, &link).collect();
    for side in &link.sides {
        open_tabs::closed(side.tab.clone(), id);
    }
    tabs::close(browser, &open).map_err(failed)
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
    let open: Vec<BrowserTab> = open_tabs::remove(browser, id)
        .map(|link| tabs_of(browser, &link).collect())
        .unwrap_or_default();
    match (pin.kind, open.as_slice()) {
        (PinKind::Tab(_), [tab]) => {
            tab.set_pinned(false).map_err(failed)?;
            tabs::move_tab(mt, browser, *tab, index, group).map_err(failed)?;
        }
        (PinKind::Tab(page), _) => {
            tabs::add_at(mt, browser, &page.url, index, group, true).map_err(failed)?;
        }
        (PinKind::Split { .. }, [first, second]) => {
            let (layout, ratio) = unsplit(*first)?;
            let split = split_pinned(*first, *second, layout, ratio, false)?;
            tabs::move_split(browser, split, index).map_err(failed)?;
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
    delete(state, id)
}

// Ends the links of `pins` in every Browser `closes` picks, and closes their
// tabs there.
fn close_where(state: &State, pins: &[PinId], closes: impl Fn(&BrowserWindow, &Browser) -> bool) {
    for window in state.windows.all() {
        for browser in window.browsers() {
            if !closes(&window, &browser) {
                continue;
            }
            let open: Vec<BrowserTab> = pins
                .iter()
                .filter_map(|pin| open_tabs::end_closing(&browser, *pin))
                .flat_map(|link| tabs_of(&browser, &link).collect::<Vec<_>>())
                .collect();
            if !open.is_empty()
                && let Err(error) = tabs::close(&browser, &open)
            {
                eprintln!("Wren closed no pin's tabs: {error:?}");
            }
        }
    }
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

// Pins two tabs, or unpins them, and makes them a split, side by side or
// stacked. Chromium ends a split one side of which is pinned or unpinned
// alone, so tabs in a split are taken out of it first (`unsplit`).
fn split_pinned(
    first: BrowserTab,
    second: BrowserTab,
    layout: SplitLayout,
    ratio: f64,
    pinned: bool,
) -> Result<TabSplit, String> {
    first.set_pinned(pinned).map_err(failed)?;
    second.set_pinned(pinned).map_err(failed)?;
    let split = first.split_with(second, layout).map_err(failed)?;
    split.set_ratio(ratio, false).map_err(failed)?;
    Ok(split)
}

// Takes the split `tab` is in apart, and answers its layout and ratio, to
// make it again.
fn unsplit(tab: BrowserTab) -> Result<(SplitLayout, f64), String> {
    let split = tab
        .state()
        .ok()
        .and_then(|state| state.split)
        .ok_or("The tabs are in no split.")?;
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

// A link of pin `id` to `tabs`, each on the page it shows now.
fn link_now(id: PinId, tabs: &[BrowserTab]) -> Link {
    link_to(id, tabs.iter().map(|tab| (*tab, page_of(*tab))))
}

// A link of pin `id` to tabs, each for the pin's page beside it.
fn link_to(id: PinId, sides: impl IntoIterator<Item = (BrowserTab, PinPage)>) -> Link {
    Link {
        pin: id,
        sides: sides
            .into_iter()
            .map(|(tab, page)| Side {
                tab: tab.persistent_id(),
                page,
            })
            .collect(),
    }
}

// The open tabs of a link, in its order.
fn tabs_of<'a>(browser: &'a Browser, link: &'a Link) -> impl Iterator<Item = BrowserTab> + 'a {
    link.sides
        .iter()
        .filter_map(|side| tab_with(browser, &side.tab))
}

// The Browser's tab with persistent ID `id`.
fn tab_with(browser: &Browser, id: &str) -> Option<BrowserTab> {
    browser
        .tabs()
        .into_iter()
        .find(|tab| tab.persistent_id() == id)
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
