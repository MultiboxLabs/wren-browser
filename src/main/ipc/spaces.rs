// The user's spaces: listing, making, changing, ordering and deleting them,
// each done by spaces.rs. The Library shows them.

use serde::Deserialize;
use wren::{MainThread, WebView};

use super::WindowRef;
use crate::app::State;
use crate::db::{NewSpace, SpaceChange, SpaceId};
use crate::spaces;

/// A space to make: whose it is, then what it has.
#[derive(Deserialize)]
struct Create {
    profile: String,
    #[serde(flatten)]
    space: NewSpace,
}

#[derive(Deserialize)]
struct Move {
    id: SpaceId,
    index: usize,
}

#[derive(Deserialize)]
struct Update {
    id: SpaceId,
    #[serde(flatten)]
    change: SpaceChange,
}

pub fn handle(web_view: &WebView, window: &WindowRef, mt: MainThread) {
    let weak = window.clone();
    let _ = web_view.handle("spaces.list", move |()| weak.state()?.db.list_spaces());

    // Makes a space at the end of its profile's, and answers with it.
    let weak = window.clone();
    let _ = web_view.handle("spaces.create", move |create: Create| {
        let state = weak.state()?;
        spaces::create(&state, mt, &create.profile, create.space)
    });

    // Changes what it is given of a space, and answers with it as it is now.
    let weak = window.clone();
    let _ = web_view.handle("spaces.update", move |update: Update| {
        let state = weak.state()?;
        spaces::update(&state, update.id, update.change)
    });

    // Moves a space to its place among every space, of any profile.
    let weak = window.clone();
    let _ = web_view.handle("spaces.move", move |moved: Move| {
        let state = weak.state()?;
        spaces::reorder(&state, moved.id, moved.index)
    });

    // Fails for the app's last space, and when a page's "Leave site?" keeps
    // it. Its Browsers close with their tabs first; then the windows on it
    // move to another of the profile's, or with none left, to the space used
    // last.
    let weak = window.clone();
    let _ = web_view.handle_call("spaces.delete", move |call| {
        let state = match weak.state() {
            Ok(state) => state,
            Err(error) => {
                let _ = call.fail(error);
                return;
            }
        };
        let id = match call.value::<SpaceId>() {
            Ok(id) => id,
            Err(error) => {
                let _ = call.fail(&error.to_string());
                return;
            }
        };
        spaces::delete(&state, id, move |result| {
            let _ = match result {
                Ok(()) => call.answer_json(None),
                Err(error) => call.fail(&error),
            };
        });
    });
}

/// Tells every window's page that the spaces changed, to read them again.
pub fn broadcast_spaces(state: &State) {
    for window in state.windows.all() {
        let _ = window.page.web_view.send("spaces.changed", &());
    }
}
