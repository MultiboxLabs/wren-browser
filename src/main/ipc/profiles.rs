// The user's profiles: the list Chromium keeps, and making, renaming and
// deleting them, each done by profiles/. The Library shows them.

use serde::{Deserialize, Serialize};
use wren::{MainThread, PageCall, WebView};

use super::WindowRef;
use crate::db::avatar;
use crate::profiles;
use crate::windows;

/// A profile as the Library lists it.
#[derive(Serialize)]
struct Entry {
    id: String,
    name: String,
    /// Its avatar's colour: #rrggbb.
    color: &'static str,
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

    // Makes a profile named as asked, with no space, and answers with it once
    // it is made.
    let weak = window.clone();
    let _ = web_view.handle_call("profiles.create", move |call| {
        let state = match weak.state() {
            Ok(state) => state,
            Err(error) => {
                let _ = call.fail(error);
                return;
            }
        };
        let name = match call.value::<String>().map_err(|error| error.to_string()) {
            Ok(name) => name,
            Err(error) => {
                let _ = call.fail(&error);
                return;
            }
        };
        profiles::create(&state, mt, &name, move |made| {
            // A page that went before its answer is no error.
            let _ = match made {
                Ok(id) => match list(mt).into_iter().find(|entry| entry.id == id) {
                    Some(entry) => call.answer(&entry),
                    None => call.fail("The new profile is not in the list."),
                },
                Err(error) => call.fail(&error),
            };
        });
    });

    // Opens a window for a profile: on its most recent space, or with none,
    // on the profile.
    let weak = window.clone();
    let _ = web_view.handle("profiles.openWindow", move |id: String| {
        windows::open_for_profile(&weak.state()?, mt, id)
    });

    // Renames a profile, answering once Chromium has its new name.
    let _ = web_view.handle_call("profiles.rename", move |call| {
        let Rename { id, name } = match call.value() {
            Ok(rename) => rename,
            Err(error) => {
                let _ = call.fail(&error.to_string());
                return;
            }
        };
        profiles::rename(mt, &id, &name, move |result| answer(call, result));
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
        profiles::delete(&state, mt, &id, move |result| answer(call, result));
    });
}

// Answers `call` with nothing, or fails it. A page that went before its
// answer is no error.
fn answer(call: PageCall, result: Result<(), String>) {
    let _ = match result {
        Ok(()) => call.answer_json(None),
        Err(error) => call.fail(&error),
    };
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
