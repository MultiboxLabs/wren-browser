// The favourites and pins a window's page draws, and what it changes of them
// (pins/). The page reads them for a space, and hears "pins.changed" when
// any window changes any.

use serde::{Deserialize, Serialize};
use wren::{Browser, MainThread, PageCall, WebView};

use super::browser::{group_of, tab};
use super::{MenuAt, WindowRef, with_browser, with_window};
use crate::analytics::{self, Event, SplitFrom};
use crate::app::State;
use crate::db::{PinId, PinKind, PinLayout, PinPage, PinPlace, PinRow, SpaceId};
use crate::menus::pin::{self as menu, PinMenu};
use crate::pages::icons;
use crate::pins::{self, PinTarget};
use crate::platform;
use crate::shell::{BrowserWindow, Place};

/// A pin as the page draws it.
#[derive(Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
enum Pin {
    Tab {
        id: PinId,
        name: Option<String>,
        page: Page,
        /// When it was last used, in milliseconds since the epoch.
        #[serde(rename = "lastActive")]
        last_active: i64,
    },
    Split {
        id: PinId,
        name: Option<String>,
        pages: [Page; 2],
        layout: Layout,
        ratio: f64,
        #[serde(rename = "lastActive")]
        last_active: i64,
    },
    Folder {
        id: PinId,
        name: Option<String>,
        open: bool,
        items: Vec<Pin>,
    },
}

/// A pin's page; its favicon by the ID the page asks for it by (`iconUrl`).
#[derive(Serialize)]
struct Page {
    url: String,
    title: String,
    favicon: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
enum Layout {
    SideBySide,
    Stacked,
}

/// What a space shows: its profile's favourites, and its own pins.
#[derive(Serialize)]
struct Pins {
    favorites: Vec<Pin>,
    pinned: Vec<Pin>,
}

#[derive(Deserialize)]
struct Rename {
    id: PinId,
    /// None, or nothing but spaces: the page's title names it again.
    name: Option<String>,
}

/// A folder to make among a space's pins.
#[derive(Deserialize)]
struct NewFolder {
    space: SpaceId,
    parent: Option<PinId>,
    /// None: last.
    index: Option<usize>,
}

/// Where a pin goes: to the favourites, or among the space's pins, at the
/// top or in folder `parent`; at `index` there, or last.
#[derive(Deserialize)]
struct To {
    favorites: bool,
    parent: Option<PinId>,
    index: Option<usize>,
}

impl To {
    fn target(&self) -> PinTarget {
        match self.favorites {
            true => PinTarget::Favorites,
            false => PinTarget::Space {
                parent: self.parent,
            },
        }
    }
}

/// A tab of the window's Browser to pin, or its split.
#[derive(Deserialize)]
struct TabToPin {
    tab: i32,
    #[serde(flatten)]
    to: To,
}

/// An address dropped on the favourites or the space's pins, to pin there.
#[derive(Deserialize)]
struct AddressToPin {
    url: String,
    #[serde(flatten)]
    to: To,
}

/// A tab of the window's Browser dropped on half of a tab pin's row, to
/// make a split with it, on `side` (0: first).
#[derive(Deserialize)]
struct SplitWith {
    id: PinId,
    tab: i32,
    side: usize,
}

/// A pin to move.
#[derive(Deserialize)]
struct MovePin {
    id: PinId,
    #[serde(flatten)]
    to: To,
}

/// A pin to make an ordinary tab, where it was dropped on the list: at
/// `index` among the list's tabs, in the group of tab `group`, or none.
#[derive(Deserialize)]
struct ToList {
    id: PinId,
    index: usize,
    group: Option<i32>,
}

/// One of an open pin's tabs: its only one, or a split's first or second.
#[derive(Deserialize)]
struct PinSide {
    id: PinId,
    side: usize,
}

/// What was chosen from a pin's menu, if anything was; for New Folder, the
/// folder's ID, for the page to name it.
#[derive(Serialize)]
struct MenuChoice {
    chosen: Option<String>,
    folder: Option<PinId>,
}

#[derive(Deserialize)]
struct SetOpen {
    id: PinId,
    open: bool,
}

pub fn handle(web_view: &WebView, window: &WindowRef, mt: MainThread) {
    // A space's favourites and pins; null for the window's profile's
    // favourites, in a window on a profile.
    let weak = window.clone();
    let _ = web_view.handle("pins.list", move |space: Option<SpaceId>| {
        let state = weak.state()?;
        match space {
            Some(space) => space_pins(&state, space),
            None => with_window(&weak, |found| profile_pins(&state, found.place())),
        }
    });

    // Makes a folder named "New Folder", and answers its ID.
    let weak = window.clone();
    let _ = web_view.handle("pins.newFolder", move |new: NewFolder| {
        let state = weak.state()?;
        let folder = pins::new_folder(&state, new.space, new.parent, new.index)?;
        let kind = analytics::PinKind::Folder;
        state.analytics.record(Event::PinAdded { kind });
        Ok::<_, String>(folder)
    });

    let weak = window.clone();
    let _ = web_view.handle("pins.rename", move |rename: Rename| {
        let state = weak.state()?;
        state.db.rename_pin(rename.id, rename.name.as_deref())?;
        broadcast_pins(&state);
        Ok::<_, String>(())
    });

    // Opens a folder, or closes it.
    let weak = window.clone();
    let _ = web_view.handle("pins.setOpen", move |set: SetOpen| {
        let state = weak.state()?;
        state.db.set_folder_open(set.id, set.open)?;
        broadcast_pins(&state);
        Ok::<_, String>(())
    });

    // Deletes a pin, and a folder's with it, closing their tabs.
    let weak = window.clone();
    let _ = web_view.handle("pins.delete", move |id: PinId| {
        let state = weak.state()?;
        pins::delete(&state, id)?;
        state.analytics.record(Event::PinDeleted);
        Ok::<_, String>(())
    });

    // Opens a pin in the window's place, or selects its tab if it is open.
    // A place without a Browser gets one first.
    let weak = window.clone();
    let _ = web_view.handle_call("pins.open", move |call| {
        let found = call
            .value::<PinId>()
            .map_err(|error| error.to_string())
            .and_then(|id| Ok((weak.state()?, id)));
        let (state, id) = match found {
            Ok(found) => found,
            Err(error) => {
                let _ = call.fail(&error);
                return;
            }
        };
        let opened = with_window(&weak, |window| {
            pins::open_in(&state, mt, window, id, move |opened| answer(call, opened));
            Ok(())
        });
        if let Err(error) = opened {
            eprintln!("Wren opened no pin: {error}");
        }
    });

    // Pins a tab, and links it: it leaves the list, drawn as the pin.
    let weak = window.clone();
    let _ = web_view.handle("pins.pinTab", move |pin: TabToPin| {
        let state = weak.state()?;
        with_browser(&weak, |window, browser| {
            let tab = tab(mt, browser, pin.tab)?;
            let (target, index) = (pin.to.target(), pin.to.index);
            let pin = pins::pin_tab(&state, browser, &place(window)?, tab, target, index)?;
            let to = match target {
                PinTarget::Favorites => analytics::PinTo::Favorites,
                PinTarget::Space { .. } => analytics::PinTo::Space,
            };
            state.analytics.record(Event::TabPinned { to });
            Ok(pin)
        })
    });

    // Pins an address dropped on the sidebar, unopened.
    let weak = window.clone();
    let _ = web_view.handle("pins.addAddress", move |add: AddressToPin| {
        let state = weak.state()?;
        with_window(&weak, |window| {
            let (target, index) = (add.to.target(), add.to.index);
            let pin = pins::add_address(&state, &place(window)?, &add.url, target, index)?;
            let kind = analytics::PinKind::Address;
            state.analytics.record(Event::PinAdded { kind });
            Ok(pin)
        })
    });

    // Makes a tab pin a split with a tab of the list.
    let weak = window.clone();
    let _ = web_view.handle("pins.splitWith", move |split: SplitWith| {
        let state = weak.state()?;
        with_browser(&weak, |window, browser| {
            let tab = tab(mt, browser, split.tab)?;
            pins::split_with(&state, browser, &place(window)?, split.id, tab, split.side)?;
            let from = SplitFrom::Pin;
            state.analytics.record(Event::SplitOpened { from });
            Ok(())
        })
    });

    // Moves a pin to the favourites, or among the space's pins.
    let weak = window.clone();
    let _ = web_view.handle("pins.move", move |moved: MovePin| {
        let state = weak.state()?;
        with_window(&weak, |window| {
            let (target, index) = (moved.to.target(), moved.to.index);
            pins::move_pin(&state, &place(window)?, moved.id, target, index)
        })
    });

    // Removes a pin dropped on the list, its tab left there as an ordinary
    // one, or opened there if the pin was unopened.
    let weak = window.clone();
    let _ = web_view.handle("pins.toList", move |to: ToList| {
        let state = weak.state()?;
        with_browser(&weak, |window, browser| {
            let group = group_of(mt, browser, to.group)?;
            pins::to_list(&state, mt, browser, &place(window)?, to.id, to.index, group)?;
            state.analytics.record(Event::PinUnpinned);
            Ok(())
        })
    });

    // A pin's context menu, or a folder's.
    let weak = window.clone();
    let _ = web_view.handle_call("pins.menu", move |call| show_menu(mt, &weak, call));

    // Takes an open pin's tab back to the pin's page.
    let weak = window.clone();
    let _ = web_view.handle("pins.back", move |at: PinSide| {
        with_browser(&weak, |_, browser| pins::back(browser, at.id, at.side))
    });

    // Closes an open pin's tabs, leaving it unopened.
    let weak = window.clone();
    let _ = web_view.handle("pins.close", move |id: PinId| {
        with_browser(&weak, |_, browser| pins::close(browser, id))
    });
}

// Shows a pin's menu, or a folder's, where the page asks, acts on what is
// chosen, and answers with it (`MenuChoice`). A menu that is not shown
// drops the call, which fails it.
fn show_menu(mt: MainThread, weak: &WindowRef, call: PageCall) {
    let found = call
        .value::<MenuAt<PinId>>()
        .map_err(|error| error.to_string())
        .and_then(|at| {
            let state = weak.state()?;
            let (view, browser, place) = with_window(weak, |window| {
                Ok((
                    window.page.web_view.view(),
                    window.browser(),
                    place(window)?,
                ))
            })?;
            let (_, space, pin) = state.db.pin(at.id)?.ok_or("That pin is gone.")?;
            Ok((state, view, browser, place, space, pin, at))
        });
    let (state, view, browser, place, space, pin, at) = match found {
        Ok(found) => found,
        Err(error) => {
            let _ = call.fail(&error);
            return;
        }
    };
    let kind = match pin.kind {
        PinKind::Folder { .. } => PinMenu::Folder,
        ref kind => PinMenu::Pin {
            favorite: space.is_none(),
            open: browser
                .as_ref()
                .is_some_and(|browser| pins::is_open(browser, pin.id)),
            away: browser
                .as_ref()
                .is_some_and(|browser| !pins::away_sides(browser, pin.id).is_empty()),
            single: matches!(kind, PinKind::Tab(_)),
            in_space: matches!(place, Place::Space(_)),
        },
    };
    let shown = mt.show_context_menu(&menu::pin_menu(&kind), view, (at.x, at.y), move |chosen| {
        let folder = act(&state, browser.as_ref(), &place, &pin, chosen.as_deref()).unwrap_or_else(
            |error| {
                eprintln!("Wren did not do what was chosen from a pin's menu: {error}");
                None
            },
        );
        let _ = call.answer(&MenuChoice { chosen, folder });
    });
    if let Err(error) = shown {
        eprintln!("Wren showed no menu: {error:?}");
    }
}

// Does what was chosen from `pin`'s menu that is the app's to do, in the
// window on `place`, whose Browser is `browser`. Answers the folder New
// Folder made: in a folder, last; next to a pin, after it.
fn act(
    state: &State,
    browser: Option<&Browser>,
    place: &Place,
    pin: &PinRow,
    chosen: Option<&str>,
) -> Result<Option<PinId>, String> {
    let id = pin.id;
    let browser = || browser.ok_or("The window has no tabs.");
    match chosen {
        Some(menu::CLOSE_TAB) => pins::close(browser()?, id)?,
        Some(menu::GO_BACK) => {
            for side in pins::away_sides(browser()?, id) {
                pins::back(browser()?, id, side)?;
            }
        }
        Some(menu::UPDATE_URL) => pins::update_url(state, browser()?, id)?,
        Some(menu::COPY_LINK) => {
            if let PinKind::Tab(page) = &pin.kind {
                platform::copy_text(&page.url);
            }
        }
        Some(menu::TO_FAVORITES) => {
            pins::move_pin(state, place, id, PinTarget::Favorites, None)?;
        }
        // First among the pins, as Pin Tab puts a tab.
        Some(menu::TO_SPACE) => {
            pins::move_pin(state, place, id, PinTarget::Space { parent: None }, Some(0))?;
        }
        Some(menu::NEW_FOLDER) => {
            let (found, index) = state.db.pin_place(id)?.ok_or("That pin is gone.")?;
            let PinPlace::Space { space, parent } = found else {
                return Err("A folder can only be among a space's pins.".into());
            };
            let made = match pin.kind {
                PinKind::Folder { .. } => pins::new_folder(state, space, Some(id), None)?,
                _ => pins::new_folder(state, space, parent, Some(index + 1))?,
            };
            return Ok(Some(made));
        }
        Some(menu::REMOVE) => pins::delete(state, id)?,
        _ => {}
    }
    Ok(None)
}

// The place the window is on, whose pins it shows.
fn place(window: &BrowserWindow) -> Result<Place, String> {
    window
        .place()
        .ok_or_else(|| "The window is on no space.".into())
}

// Answers a call with what was done, or why not.
fn answer(call: wren::PageCall, result: Result<(), String>) {
    let _ = match result {
        Ok(()) => call.answer(&()),
        Err(error) => call.fail(&error),
    };
}

/// Tells every window's page that pins changed, to read them again.
pub fn broadcast_pins(state: &State) {
    for window in state.windows.all() {
        let _ = window.page.web_view.send("pins.changed", &());
    }
}

fn space_pins(state: &State, space: SpaceId) -> Result<Pins, String> {
    let profile = state.db.space(space)?.ok_or("That space is gone.")?.profile;
    Ok(Pins {
        favorites: pins(state.db.favorites(&profile)?),
        pinned: pins(state.db.space_pins(space)?),
    })
}

// A window on a profile shows its favourites, and has no pins; an
// off-the-record one has neither.
fn profile_pins(state: &State, place: Option<Place>) -> Result<Pins, String> {
    let favorites = match place {
        Some(Place::Profile {
            id,
            off_the_record: false,
        }) => pins(state.db.favorites(&id)?),
        _ => Vec::new(),
    };
    Ok(Pins {
        favorites,
        pinned: Vec::new(),
    })
}

fn pins(rows: Vec<PinRow>) -> Vec<Pin> {
    rows.into_iter().map(pin).collect()
}

fn pin(row: PinRow) -> Pin {
    let PinRow {
        id,
        name,
        kind,
        last_active,
    } = row;
    // In milliseconds, as the page's `Date` takes it.
    let last_active = last_active * 1000;
    match kind {
        PinKind::Tab(page) => Pin::Tab {
            id,
            name,
            page: drawn(page),
            last_active,
        },
        PinKind::Split {
            first,
            second,
            layout,
            ratio,
        } => Pin::Split {
            id,
            name,
            pages: [drawn(first), drawn(second)],
            layout: match layout {
                PinLayout::SideBySide => Layout::SideBySide,
                PinLayout::Stacked => Layout::Stacked,
            },
            ratio,
            last_active,
        },
        PinKind::Folder { open, items } => Pin::Folder {
            id,
            name,
            open,
            items: pins(items),
        },
    }
}

fn drawn(page: PinPage) -> Page {
    Page {
        url: page.url,
        title: page.title,
        favicon: page.favicon.map(icons::id),
    }
}
