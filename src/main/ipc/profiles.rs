// The user's profiles: the list Chromium keeps, and making, renaming and
// deleting them. The Library shows them.

use std::cell::{Cell, RefCell};
use std::collections::HashMap;
use std::thread;
use std::time::Duration;

use dispatch2::DispatchQueue;
use serde::Serialize;
use wren::{MainThread, PageCall, WebView};

use super::{WindowRef, failed};

/// A profile as the Library lists it.
#[derive(Serialize)]
struct Entry {
    id: String,
    name: String,
}

pub fn handle(web_view: &WebView, window: &WindowRef, mt: MainThread) {
    // The profiles Chromium lists, in its order.
    let _ = web_view.handle("profiles.list", move |()| Ok::<_, String>(list(mt)));

    // Makes a profile named as asked, and answers with it once it is made.
    let weak = window.clone();
    let _ = web_view.handle_call("profiles.create", move |call| {
        let state = match weak.state() {
            Ok(state) => state,
            Err(error) => {
                let _ = call.fail(error);
                return;
            }
        };
        let name = match call.value::<String>() {
            Ok(name) if !name.trim().is_empty() => name.trim().to_owned(),
            Ok(_) => {
                let _ = call.fail("A profile needs a name.");
                return;
            }
            Err(error) => {
                let _ = call.fail(&error.to_string());
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
            // The profile gets its default space now, in the list's order.
            state.db.sync_profiles(&mt.profile_list(), true);
            let listed = list(mt);
            // A page that went before its answer is no error.
            let _ = match result {
                Ok(profile) => {
                    let id = profile.id();
                    match listed.iter().find(|entry| entry.id == id) {
                        Some(entry) => call.answer(entry),
                        None => call.fail("The new profile is not in the list."),
                    }
                }
                Err(error) => call.fail(&failed(error)),
            };
        });
    });

    // TODO: Rename the profile once Wren has a call for it; it takes
    // `{ id, name }`. Until then the call waits a second and fails, to see the
    // page's working and failed states.
    let _ = web_view.handle_call("profiles.rename", fail_later);

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
            id: entry.id,
            name: entry.name,
        })
        .collect()
}
