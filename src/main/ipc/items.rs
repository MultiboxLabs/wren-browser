// The calls a page makes for the items of its sidebar: an item moved to a
// place, or several marked ones ("items.move"), an address put at one ("items.add"), and an item's
// menu ("items.menu"). The app decides what each does (items/).
// src/renderer/ipc/items.ts is the page's side.

use std::rc::Rc;

use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use wren::{MainThread, MenuItem, PageCall, WebView};

use super::WindowRef;
use crate::analytics::{self, Event, SplitFrom, TabFrom};
use crate::app::State;
use crate::db::PinId;
use crate::items::menu::Subject;
use crate::items::{self, Added, Destination, ItemRef, Moved};
use crate::menus;
use crate::pins::PinTarget;
use crate::shell::WindowId;

#[derive(Deserialize)]
struct Move {
    items: Vec<ItemRef>,
    to: Destination,
}

#[derive(Deserialize)]
struct Add {
    url: String,
    to: Destination,
}

/// An item whose menu is asked for, and the point in the page.
#[derive(Deserialize)]
struct MenuAt {
    #[serde(flatten)]
    of: MenuOf,
    x: f64,
    y: f64,
}

/// An item, the side of it that was pressed (of a split's two), and, if it
/// is one of several rows marked together, each of them in the sidebar's
/// order: all tabs of the list, or all pinned tabs.
#[derive(Deserialize)]
pub(super) struct MenuOf {
    item: ItemRef,
    side: usize,
    #[serde(default)]
    marked: Vec<ItemRef>,
}

/// What was chosen from an item's menu, if anything was, once the app has
/// done it; for New Folder, the folder's ID, for the page to name it.
#[derive(Serialize)]
pub(super) struct MenuChoice {
    chosen: Option<String>,
    folder: Option<PinId>,
}

pub fn handle(web_view: &WebView, window: &WindowRef, mt: MainThread) {
    // An item of the sidebar dropped at a place in it, or several marked
    // ones. Answered once it is there: a space without a Browser gets one
    // first.
    let weak = window.clone();
    let _ = web_view.handle_call("items.move", move |call| {
        let Some((moving, state, call)) = asked::<Move>(&weak, call) else {
            return;
        };
        let counted = state.clone();
        items::move_items(&state, mt, weak.id, moving.items, moving.to, move |moved| {
            answer(call, moved.map(|moved| count_moves(&counted, moved)));
        });
    });

    // An item's context menu, at the point the page names. Answered with
    // what was chosen, once the app has done it. A menu that is not shown
    // drops the call, which fails it.
    let weak = window.clone();
    let _ = web_view.handle_call("items.menu", move |call| {
        let Some((at, state, call)) = asked::<MenuAt>(&weak, call) else {
            return;
        };
        let found = menu_of(&state, mt, weak.id, &at.of).and_then(|found| {
            let window = state.windows.get(weak.id).ok_or("The window is closing.")?;
            Ok((window.page.web_view.view(), found))
        });
        let (view, (subject, items)) = match found {
            Ok(found) => found,
            Err(error) => {
                let _ = call.fail(&error);
                return;
            }
        };
        let shown = mt.show_context_menu(&items, view, (at.x, at.y), move |chosen| {
            choose(&state, mt, subject, chosen, move |choice| {
                let _ = call.answer(&choice);
            });
        });
        if let Err(error) = shown {
            eprintln!("Wren showed no menu: {error:?}");
        }
    });

    // A web address or a file dropped on the sidebar: a tab on it in the
    // list, or an unopened pin.
    let weak = window.clone();
    let _ = web_view.handle_call("items.add", move |call| {
        let Some((adding, state, call)) = asked::<Add>(&weak, call) else {
            return;
        };
        let counted = state.clone();
        items::add_address(&state, mt, weak.id, adding.url, adding.to, move |added| {
            answer(call, added.map(|added| count_add(&counted, added)));
        });
    });
}

/// The item the page names in window `window`, or the rows marked with it,
/// and the items of its menu.
pub(super) fn menu_of(
    state: &State,
    mt: MainThread,
    window: WindowId,
    of: &MenuOf,
) -> Result<(Subject, Vec<MenuItem>), String> {
    let subject = Subject::find(state, mt, window, &of.item, of.side, &of.marked)?;
    let items = menus::item_menu(&subject)?;
    Ok((subject, items))
}

/// Does what was chosen from `subject`'s menu, counts it, and calls `done`
/// with what to answer the page. What fails is logged: the page hears what
/// was chosen all the same, as the menu has closed.
pub(super) fn choose(
    state: &Rc<State>,
    mt: MainThread,
    subject: Subject,
    chosen: Option<String>,
    done: impl FnOnce(MenuChoice) + 'static,
) {
    let Some(id) = chosen else {
        return done(MenuChoice {
            chosen: None,
            folder: None,
        });
    };
    let counted = state.clone();
    items::menu::choose(state, mt, subject, &id.clone(), move |did| {
        let folder = match did {
            Ok(did) => {
                count_moves(&counted, did.moved);
                did.folder
            }
            Err(error) => {
                eprintln!("Wren did not do what was chosen from a menu: {error}");
                None
            }
        };
        done(MenuChoice {
            chosen: Some(id),
            folder,
        });
    });
}

// What a call asks, the app's state, and the call to answer. A call that
// asks nothing the app can read, or comes as the app closes, is failed.
fn asked<V: DeserializeOwned>(
    window: &WindowRef,
    call: PageCall,
) -> Option<(V, Rc<State>, PageCall)> {
    let found = call
        .value::<V>()
        .map_err(|error| error.to_string())
        .and_then(|value| Ok((value, window.state()?)));
    match found {
        Ok((value, state)) => Some((value, state, call)),
        Err(error) => {
            let _ = call.fail(&error);
            None
        }
    }
}

fn answer(call: PageCall, result: Result<(), String>) {
    let _ = match result {
        Ok(()) => call.answer(&()),
        Err(error) => call.fail(&error),
    };
}

fn count_moves(state: &State, moved: Vec<Moved>) {
    for moved in moved {
        count_move(state, moved);
    }
}

fn count_move(state: &State, moved: Moved) {
    let event = match moved {
        Moved::Placed => return,
        Moved::Pinned(PinTarget::Favorites) => Event::TabPinned {
            to: analytics::PinTo::Favorites,
        },
        Moved::Pinned(PinTarget::Space { .. }) => Event::TabPinned {
            to: analytics::PinTo::Space,
        },
        Moved::Unpinned => Event::PinUnpinned,
        Moved::Split { pin: false } => Event::SplitOpened {
            from: SplitFrom::Tabs,
        },
        Moved::Split { pin: true } => Event::SplitOpened {
            from: SplitFrom::Pin,
        },
        Moved::Folder => Event::PinAdded {
            kind: analytics::PinKind::Folder,
        },
    };
    state.analytics.record(event);
}

fn count_add(state: &State, added: Added) {
    state.analytics.record(match added {
        Added::Tab => Event::TabOpened {
            from: TabFrom::Drop,
        },
        Added::Pin => Event::PinAdded {
            kind: analytics::PinKind::Address,
        },
    });
}
