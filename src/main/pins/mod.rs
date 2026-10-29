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

use wren::{Browser, BrowserTab, SplitLayout, SplitState};

use crate::app::State;
use crate::db::{NewPin, PinId, PinKind, PinLayout, PinPage, PinPlace, PinRow, SpaceId};
use crate::shell::Place;
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
            // Pinning one side alone would end the split: it is made again
            // from the two, pinned.
            split.unsplit().map_err(failed)?;
            pin_split(first, second, layout, ratio)?;
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
            if let Err(error) = pin_split(one, two, split_layout(layout), ratio) {
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
    for window in state.windows.all() {
        for browser in window.browsers() {
            let open: Vec<BrowserTab> = deleted
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
    crate::ipc::broadcast_pins(state);
    Ok(())
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

// Pins two tabs and makes them a split, side by side or stacked.
fn pin_split(
    first: BrowserTab,
    second: BrowserTab,
    layout: SplitLayout,
    ratio: f64,
) -> Result<(), String> {
    first.set_pinned(true).map_err(failed)?;
    second.set_pinned(true).map_err(failed)?;
    let split = first.split_with(second, layout).map_err(failed)?;
    split.set_ratio(ratio, false).map_err(failed)
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
