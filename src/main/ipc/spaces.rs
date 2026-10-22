// The user's spaces: listing, making, changing and deleting them. The Library
// shows them. A space belongs to a profile, and goes when it does (see `db`).

use serde::Deserialize;
use wren::{MainThread, WebView};

use super::WindowRef;
use crate::app::State;
use crate::db::{NewSpace, SpaceChange, SpaceId, SpaceRow};

/// A space to make: whose it is, then what it has.
#[derive(Deserialize)]
struct Create {
    profile: String,
    #[serde(flatten)]
    space: NewSpace,
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
        broadcast_spaces(&state);
        Ok::<SpaceRow, String>(space)
    });

    // Changes what it is given of a space, and answers with it as it is now.
    let weak = window.clone();
    let _ = web_view.handle("spaces.update", move |update: Update| {
        let state = weak.state()?;
        let space = state.db.update_space(update.id, update.change)?;
        broadcast_spaces(&state);
        Ok::<SpaceRow, String>(space)
    });

    // Fails for a profile's last space. The windows on it move to another of
    // the profile's, and its Browsers close with their tabs.
    let weak = window.clone();
    let _ = web_view.handle("spaces.delete", move |id: SpaceId| {
        let state = weak.state()?;
        let profile = state.db.space(id)?.ok_or("That space is gone.")?.profile;
        state.db.delete_space(id)?;
        state.space_deleted(id, &profile);
        broadcast_spaces(&state);
        Ok::<_, String>(())
    });
}

/// Tells every window's page that the spaces changed, to read them again,
/// and lists them anew in the main menu.
pub fn broadcast_spaces(state: &State) {
    if let Some(mt) = MainThread::get() {
        state.update_menu(mt);
    }
    for window in state.windows.all() {
        let _ = window.page.web_view.send("spaces.changed", &());
    }
}
