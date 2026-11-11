// The calls a page makes for what is dropped in its sidebar: an item moved
// to a place ("items.move"), or an address put at one ("items.add"). The
// app decides what each does (items/). src/renderer/ipc/items.ts is the
// page's side.

use std::rc::Rc;

use serde::Deserialize;
use serde::de::DeserializeOwned;
use wren::{MainThread, PageCall, WebView};

use super::WindowRef;
use crate::analytics::{self, Event, SplitFrom, TabFrom};
use crate::app::State;
use crate::items::{self, Added, Destination, ItemRef, Moved};
use crate::pins::PinTarget;

#[derive(Deserialize)]
struct Move {
    item: ItemRef,
    to: Destination,
}

#[derive(Deserialize)]
struct Add {
    url: String,
    to: Destination,
}

pub fn handle(web_view: &WebView, window: &WindowRef, mt: MainThread) {
    // An item of the sidebar dropped at a place in it. Answered once it is
    // there: a space without a Browser gets one first.
    let weak = window.clone();
    let _ = web_view.handle_call("items.move", move |call| {
        let Some((moving, state, call)) = asked::<Move>(&weak, call) else {
            return;
        };
        let counted = state.clone();
        items::move_item(&state, mt, weak.id, moving.item, moving.to, move |moved| {
            answer(call, moved.map(|moved| count_move(&counted, moved)));
        });
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
