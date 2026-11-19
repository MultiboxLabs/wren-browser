// The profiles: making, renaming and deleting one, what follows a change to
// their list, and a profile opening. Each follows the password manager and
// autofill settings (filling.rs). Chromium keeps the profiles and their
// list; the database keeps each one's spaces (db/profiles.rs).

pub mod filling;

use std::rc::Rc;

use wren::{Error, MainThread, Profile, ProfileKind};

use crate::app::State;
use crate::spaces;
use crate::windows;

/// Makes a profile named `name`, with no space, and gives `done` its ID
/// once it is made.
pub fn create(
    state: &Rc<State>,
    mt: MainThread,
    name: &str,
    done: impl FnOnce(Result<String, String>) + 'static,
) {
    let name = name.trim();
    if name.is_empty() {
        return done(Err("A profile needs a name.".into()));
    }
    let state = state.clone();
    mt.create_profile(Some(name), move |result| {
        let made = result.map(|profile| profile.id());
        state.db.sync_profiles(&mt.profile_list());
        spaces::changed(&state);
        done(made.map_err(failed));
    });
}

/// Renames profile `id`, and tells `done` once Chromium has its new name.
/// The list changing tells every window (`list_changed`).
pub fn rename(
    mt: MainThread,
    id: &str,
    name: &str,
    done: impl FnOnce(Result<(), String>) + 'static,
) {
    let name = name.trim().to_owned();
    if name.is_empty() {
        return done(Err("A profile needs a name.".into()));
    }
    mt.open_profile(Some(id), move |result| {
        done(
            result
                .and_then(|profile| profile.rename(&name))
                .map_err(failed),
        );
    });
}

/// Deletes profile `id` and its data, once its Browsers have closed, and
/// its spaces with it. A page that keeps its tab open fails it.
pub fn delete(
    state: &Rc<State>,
    mt: MainThread,
    id: &str,
    done: impl FnOnce(Result<(), String>) + 'static,
) {
    let state = state.clone();
    mt.open_profile(Some(id), move |result| {
        let profile = match result {
            Ok(profile) => profile,
            Err(error) => return done(Err(failed(error))),
        };
        let id = profile.id();
        profile.delete(move |result| {
            if let Err(error) = result {
                return done(Err(failed(error)));
            }
            if let Err(error) = state.db.forget_profile(&id) {
                eprintln!("Wren could not forget a profile: {error}");
            }
            windows::leave_gone_spaces(&state, None);
            windows::leave_gone_profiles(&state, mt);
            spaces::changed(&state);
            done(Ok(()));
        });
    });
}

/// The list of profiles changed. A profile deleted elsewhere takes its
/// spaces and windows with it. One renamed is told too: the page and the
/// main menu show profiles' names.
pub fn list_changed(state: &Rc<State>, mt: MainThread) {
    if state.db.sync_profiles(&mt.profile_list()) {
        windows::leave_gone_spaces(state, None);
    }
    windows::leave_gone_profiles(state, mt);
    spaces::changed(state);
}

/// `profile` opened: it follows the filling settings, and keeps its session
/// data.
pub fn opened(profile: &Profile) {
    filling::opened(profile);
    keep_session_data(profile);
}

// Has a profile Chromium loaded keep its session data for the next restore
// (windows/session.rs). A profile reads the setting as it
// loads, so this applies from its next load. Policy may keep it off, which
// is no error. An off-the-record or ephemeral profile has none to keep.
fn keep_session_data(profile: &Profile) {
    if profile.kind() != ProfileKind::Persistent || profile.keeps_session_data() {
        return;
    }
    match profile.set_keeps_session_data(true) {
        Ok(()) | Err(Error::NotAllowed) => {}
        Err(error) => eprintln!("Wren could not keep a profile's session data: {error:?}"),
    }
}

// An error of Wren Runtime's, as a page is told of it.
fn failed(error: Error) -> String {
    format!("{error:?}")
}
