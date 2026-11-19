// The user's spaces: listing, making, changing, ordering and deleting them.
// The Library shows them. A space belongs to a profile, and goes when it does
// (see `db`).

use serde::Deserialize;
use wren::{MainThread, WebView};

use super::WindowRef;
use crate::analytics::{Event, SpaceField};
use crate::app::State;
use crate::db::{NewSpace, SpaceChange, SpaceId, SpaceRow};
use crate::menus;

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
        if !mt
            .profile_list()
            .iter()
            .any(|profile| profile.id == create.profile)
        {
            return Err("That profile is gone.".to_owned());
        }
        let space = state.db.create_space(&create.profile, create.space)?;
        state.analytics.record(Event::SpaceCreated);
        broadcast_spaces(&state);
        Ok::<SpaceRow, String>(space)
    });

    // Changes what it is given of a space, and answers with it as it is now.
    let weak = window.clone();
    let _ = web_view.handle("spaces.update", move |update: Update| {
        let state = weak.state()?;
        let change = &update.change;
        let fields = [
            (change.name.is_some(), SpaceField::Name),
            (change.icon.is_some(), SpaceField::Icon),
            (change.theme.is_some(), SpaceField::Theme),
        ];
        let space = state.db.update_space(update.id, update.change)?;
        for (_, field) in fields.into_iter().filter(|(changed, _)| *changed) {
            state.analytics.record(Event::SpaceCustomized { field });
        }
        broadcast_spaces(&state);
        Ok::<SpaceRow, String>(space)
    });

    // Moves a space to its place among every space, of any profile.
    let weak = window.clone();
    let _ = web_view.handle("spaces.move", move |moved: Move| {
        let state = weak.state()?;
        state.db.move_space(moved.id, moved.index)?;
        broadcast_spaces(&state);
        Ok::<_, String>(())
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
        state.delete_space(id, move |result| {
            let _ = match result {
                Ok(()) => call.answer_json(None),
                Err(error) => call.fail(&error),
            };
        });
    });
}

/// Tells every window's page that the spaces changed, to read them again,
/// and lists them anew in the main menu.
pub fn broadcast_spaces(state: &State) {
    if let Some(mt) = MainThread::get() {
        menus::update_main_menu(state, mt);
    }
    for window in state.windows.all() {
        let _ = window.page.web_view.send("spaces.changed", &());
        // One with no tab is named for its space.
        state.update_title(&window);
    }
}
