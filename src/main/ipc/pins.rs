// The favourites and pins a window's page draws, and what it changes of them
// (pins/). The page reads them for a space, and hears "pins.changed" when
// any window changes any.

use serde::{Deserialize, Serialize};
use wren::{MainThread, WebView};

use super::browser::{group_of, tab};
use super::{WindowRef, with_browser, with_window};
use crate::app::State;
use crate::db::{PinId, PinKind, PinLayout, PinPage, PinRow, SpaceId};
use crate::pages::icons;
use crate::pins::{self, PinTarget};
use crate::shell::{BrowserWindow, Place};

/// A pin as the page draws it.
#[derive(Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
enum Pin {
    Tab {
        id: PinId,
        name: Option<String>,
        page: Page,
    },
    Split {
        id: PinId,
        name: Option<String>,
        pages: [Page; 2],
        layout: Layout,
        ratio: f64,
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
        pins::new_folder(&state, new.space, new.parent, new.index)
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
        pins::delete(&state, id)
    });

    // Opens a pin in the window's place, or selects its tab if it is open.
    // A place without a Browser gets one first, as the omnibox's does.
    let weak = window.clone();
    let _ = web_view.handle_call("pins.open", move |call| {
        let id: PinId = match call.value() {
            Ok(id) => id,
            Err(error) => {
                let _ = call.fail(&error.to_string());
                return;
            }
        };
        let found = weak.state().map_err(str::to_owned).and_then(|state| {
            with_window(&weak, |window| Ok((window.browser(), window.place())))
                .map(|found| (state, found))
        });
        let open = move |state: &State, weak: &WindowRef| {
            with_browser(weak, |window, browser| {
                pins::open(state, browser, &place(window)?, id)
            })
        };
        match found {
            Ok((state, (Some(_), _))) => answer(call, open(&state, &weak)),
            Ok((state, (None, Some(place)))) => {
                let (inner, weak) = (state.clone(), weak.clone());
                state.open_browser(mt, weak.id, place, move || {
                    answer(call, open(&inner, &weak));
                });
            }
            Ok((_, (None, None))) => {
                let _ = call.fail("The window is on no space.");
            }
            Err(error) => {
                let _ = call.fail(&error);
            }
        }
    });

    // Pins a tab, and links it: it leaves the list, drawn as the pin.
    let weak = window.clone();
    let _ = web_view.handle("pins.pinTab", move |pin: TabToPin| {
        let state = weak.state()?;
        with_browser(&weak, |window, browser| {
            let tab = tab(mt, browser, pin.tab)?;
            let (target, index) = (pin.to.target(), pin.to.index);
            pins::pin_tab(&state, browser, &place(window)?, tab, target, index)
        })
    });

    // Pins an address dropped on the sidebar, unopened.
    let weak = window.clone();
    let _ = web_view.handle("pins.addAddress", move |add: AddressToPin| {
        let state = weak.state()?;
        with_window(&weak, |window| {
            let (target, index) = (add.to.target(), add.to.index);
            pins::add_address(&state, &place(window)?, &add.url, target, index)
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
            pins::to_list(&state, mt, browser, &place(window)?, to.id, to.index, group)
        })
    });

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
    let PinRow { id, name, kind } = row;
    match kind {
        PinKind::Tab(page) => Pin::Tab {
            id,
            name,
            page: drawn(page),
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
