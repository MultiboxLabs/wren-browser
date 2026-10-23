// The user's profiles: the list Chromium keeps, and making, renaming and
// deleting them. The Library shows them.

use std::cell::{Cell, RefCell};
use std::collections::HashMap;
use std::thread;
use std::time::Duration;

use dispatch2::DispatchQueue;
use serde::{Deserialize, Serialize};
use wren::{MainThread, PageCall, WebView};

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
                && let Err(error) = state.db.ensure_space(id, space)
            {
                eprintln!("Wren could not give a profile its space: {error}");
            }
            // Whatever it has no space of is given the default one.
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

    // TODO: Delete the profile and its data once Wren has a call for it; it
    // takes the profile's ID. Until then the call waits a second and fails, as
    // the rename does. Where the deletion succeeds, also call
    // `state.db.forget_profile(id)`: that deletes the profile's spaces.
    let _ = web_view.handle_call("profiles.delete", fail_later);
}

thread_local! {
    // Calls waiting to fail, by ID. A call stays on the main thread; only
    // its ID goes to the thread that waits.
    static WAITING: RefCell<HashMap<u64, PageCall>> = RefCell::new(HashMap::new());
    static NEXT_ID: Cell<u64> = const { Cell::new(0) };
}

// Fails the call a second from now, as one the app could not do.
fn fail_later(call: PageCall) {
    let id = NEXT_ID.with(|next| next.replace(next.get() + 1));
    WAITING.with(|waiting| waiting.borrow_mut().insert(id, call));
    thread::spawn(move || {
        thread::sleep(Duration::from_secs(1));
        DispatchQueue::main().exec_async(move || {
            if let Some(call) = WAITING.with(|waiting| waiting.borrow_mut().remove(&id)) {
                let _ = call.fail("Wren cannot do this yet.");
            }
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
