// The user's profiles: the list Chromium keeps, and making, renaming and
// deleting them. The Library shows them.

use serde::{Deserialize, Serialize};
use wren::{MainThread, WebView};

use super::{self as ipc, WindowRef, failed};
use crate::db::{NewSpace, avatar};

/// A profile as the Library lists it.
#[derive(Serialize)]
struct Entry {
    id: String,
    name: String,
    /// Its avatar's colour: #rrggbb.
    color: &'static str,
}

/// What `profiles.create` takes: a name, or a name and the profile's first space.
#[derive(Deserialize)]
#[serde(untagged)]
enum Create {
    Name(String),
    Named {
        name: String,
        space: Option<NewSpace>,
    },
}

/// What `profiles.rename` takes.
#[derive(Deserialize)]
struct Rename {
    id: String,
    name: String,
}

pub fn handle(web_view: &WebView, window: &WindowRef, mt: MainThread) {
    // The profiles Chromium lists, in its order.
    let _ = web_view.handle("profiles.list", move |()| Ok::<_, String>(list(mt)));

    // Makes a profile named as asked, with `space` as its first space if one
    // is given, and answers with it once both are made.
    let weak = window.clone();
    let _ = web_view.handle_call("profiles.create", move |call| {
        let state = match weak.state() {
            Ok(state) => state,
            Err(error) => {
                let _ = call.fail(error);
                return;
            }
        };
        let (name, space) = match call.value::<Create>().map_err(|error| error.to_string()) {
            Ok(Create::Name(name)) => (name, None),
            Ok(Create::Named { name, space }) => (name, space),
            Err(error) => {
                let _ = call.fail(&error);
                return;
            }
        };
        let name = name.trim().to_owned();
        if name.is_empty() {
            let _ = call.fail("A profile needs a name.");
            return;
        }
        // A space that can't be kept is refused before the profile is made.
        let space = match space.map(NewSpace::checked).transpose() {
            Ok(space) => space,
            Err(error) => {
                let _ = call.fail(&error);
                return;
            }
        };
        // Until the call finishes, the list changing does not give the new
        // profile its space (see `State::creating_profiles`).
        state
            .creating_profiles
            .set(state.creating_profiles.get() + 1);
        mt.create_profile(Some(&name), move |result| {
            state
                .creating_profiles
                .set(state.creating_profiles.get() - 1);
            let made = result.map(|profile| profile.id());
            if let (Ok(id), Some(space)) = (&made, space)
                && let Err(error) = state.db.add_profile(id, space)
            {
                eprintln!("Wren could not give a profile its space: {error}");
            }
            // Given none, it gets the default one.
            state.db.sync_profiles(&mt.profile_list(), true);
            ipc::broadcast_spaces(&state);
            // A page that went before its answer is no error.
            let _ = match made {
                Ok(id) => match list(mt).into_iter().find(|entry| entry.id == id) {
                    Some(entry) => call.answer(&entry),
                    None => call.fail("The new profile is not in the list."),
                },
                Err(error) => call.fail(&failed(error)),
            };
        });
    });

    // Renames a profile, answering once Chromium has its new name. The list
    // changing tells every window (`App::changed`).
    let _ = web_view.handle_call("profiles.rename", move |call| {
        let Rename { id, name } = match call.value() {
            Ok(rename) => rename,
            Err(error) => {
                let _ = call.fail(&error.to_string());
                return;
            }
        };
        let name = name.trim().to_owned();
        if name.is_empty() {
            let _ = call.fail("A profile needs a name.");
            return;
        }
        mt.open_profile(Some(&id), move |result| {
            let _ = match result.and_then(|profile| profile.rename(&name)) {
                Ok(()) => call.answer_json(None),
                Err(error) => call.fail(&failed(error)),
            };
        });
    });

    // Deletes a profile and its data, once its Browsers have closed, and its
    // spaces with it. A page that keeps its tab open fails it.
    let weak = window.clone();
    let _ = web_view.handle_call("profiles.delete", move |call| {
        let state = match weak.state() {
            Ok(state) => state,
            Err(error) => {
                let _ = call.fail(error);
                return;
            }
        };
        let id = match call.value::<String>() {
            Ok(id) => id,
            Err(error) => {
                let _ = call.fail(&error.to_string());
                return;
            }
        };
        mt.open_profile(Some(&id), move |result| {
            let profile = match result {
                Ok(profile) => profile,
                Err(error) => {
                    let _ = call.fail(&failed(error));
                    return;
                }
            };
            let id = profile.id();
            profile.delete(move |result| {
                let _ = match result {
                    Ok(()) => {
                        if let Err(error) = state.db.forget_profile(&id) {
                            eprintln!("Wren could not forget a profile: {error}");
                        }
                        state.leave_gone_spaces(None);
                        state.leave_gone_profiles(mt);
                        ipc::broadcast_spaces(&state);
                        call.answer_json(None)
                    }
                    Err(error) => call.fail(&failed(error)),
                };
            });
        });
    });
}

fn list(mt: MainThread) -> Vec<Entry> {
    mt.profile_list()
        .into_iter()
        .map(|entry| Entry {
            color: avatar(&entry.id),
            id: entry.id,
            name: entry.name,
        })
        .collect()
}
