// Which Wren profile each of a source's profiles lands in: the tab's own, one
// of the user's others, or a new one of its name, made as the Library makes
// one (ipc/profiles.rs).

use std::rc::Rc;

use serde::Deserialize;
use wren::{MainThread, Profile};

use crate::app::State;
use crate::ipc;

#[derive(Clone, Debug, Deserialize, PartialEq)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Landing {
    This,
    Existing { id: String },
    New { name: String },
}

/// The profile `landing` names, opened, and whether it was made for this;
/// `done` gets it later, from the event loop.
pub fn resolve(
    mt: MainThread,
    state: &Rc<State>,
    this: &Profile,
    landing: &Landing,
    done: impl FnOnce(Result<(Profile, bool), String>) + 'static,
) {
    match landing {
        Landing::This => done(Ok((this.clone(), false))),
        Landing::Existing { id } => {
            if !mt.profile_list().iter().any(|entry| entry.id == *id) {
                return done(Err("That profile is gone.".into()));
            }
            mt.open_profile(Some(id), move |result| {
                done(
                    result
                        .map(|profile| (profile, false))
                        .map_err(|error| format!("Wren could not open the profile: {error:?}")),
                )
            });
        }
        Landing::New { name } => {
            let name = match name.trim() {
                "" => "Imported",
                name => name,
            };
            let state = state.clone();
            mt.create_profile(Some(name), move |result| {
                state.db.sync_profiles(&mt.profile_list());
                ipc::broadcast_spaces(&state);
                done(
                    result
                        .map(|profile| (profile, true))
                        .map_err(|error| format!("Wren could not make the profile: {error:?}")),
                )
            });
        }
    }
}
