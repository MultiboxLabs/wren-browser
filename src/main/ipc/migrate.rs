// wren://migrate's calls, which come through Wren Components
// (extensions/bridge.rs), not `wren.invoke`: it is a page in a tab.
// src/renderer/ipc/migrate.ts is the page's side.

use serde::Serialize;
use wren::MainThread;

use crate::extensions::bridge;
use crate::import;
use crate::pages::MIGRATE;

/// A profile of the user's in Wren.
#[derive(Serialize)]
struct WrenProfile {
    id: String,
    name: String,
}

/// Where the page is: whether its tab is incognito, the profile its tab is
/// in (an incognito tab's original), and every profile there is, which the
/// user's other profiles may land in.
#[derive(Serialize)]
struct Context {
    incognito: bool,
    profile: Option<WrenProfile>,
    profiles: Vec<WrenProfile>,
}

pub fn handle_migrate(mt: MainThread) {
    bridge::handle(&MIGRATE, "migrate.context", move |call, ()| {
        let profiles: Vec<WrenProfile> = mt
            .profile_list()
            .into_iter()
            .map(|entry| WrenProfile {
                id: entry.id,
                name: entry.name,
            })
            .collect();
        let id = call.profile().map(|profile| profile.id());
        let profile = profiles
            .iter()
            .find(|profile| Some(&profile.id) == id.as_ref())
            .map(|profile| WrenProfile {
                id: profile.id.clone(),
                name: profile.name.clone(),
            });
        Ok(Context {
            incognito: call.incognito(),
            profile,
            profiles,
        })
    });

    // The browsers installed, which the user may bring their things over
    // from.
    bridge::handle(&MIGRATE, "migrate.sources", |_, ()| Ok(import::installed()));
}
