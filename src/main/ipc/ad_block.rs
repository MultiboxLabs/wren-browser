// Each profile's ad blocker (extensions/ad_block.rs): whether it is on, and
// turning it on or off, as the Library does. Chromium keeps it, so its
// extensions page turns it on or off too; `adBlock.changed` tells every window
// either way.

use serde::{Deserialize, Serialize};
use wren::{MainThread, Profile, ProfileKind, WebView};

use super::failed;
use crate::app::State;
use crate::extensions::ad_block::{self, AdBlock};

/// What `adBlock.set` takes.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Set {
    profile_id: String,
    enabled: bool,
}

/// What `adBlock.changed` says.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Changed<'a> {
    profile_id: &'a str,
    ad_block: Option<AdBlock>,
}

pub fn handle(web_view: &WebView, mt: MainThread) {
    // The profile's ad blocker, or null while it has none. A profile with
    // no window is loaded to be asked.
    let _ = web_view.handle_call("adBlock.get", move |call| {
        let profile_id = match call.value::<String>() {
            Ok(id) => id,
            Err(error) => {
                let _ = call.fail(&error.to_string());
                return;
            }
        };
        ad_block::read(mt, &profile_id, move |result| {
            // A page that went before its answer is no error.
            let _ = match result {
                Ok(ad_block) => call.answer(&ad_block),
                Err(error) => call.fail(&failed(error)),
            };
        });
    });

    // Turns it on or off, and answers with it after. Every window is told
    // by the change that follows (`broadcast_ad_block`).
    let _ = web_view.handle_call("adBlock.set", move |call| {
        let Set {
            profile_id,
            enabled,
        } = match call.value() {
            Ok(set) => set,
            Err(error) => {
                let _ = call.fail(&error.to_string());
                return;
            }
        };
        ad_block::set(mt, &profile_id, enabled, move |result| {
            let _ = match result {
                Ok(ad_block) => call.answer(&ad_block),
                Err(error) => call.fail(&failed(error)),
            };
        });
    });
}

/// Tells every window's page the profile's ad blocker, as its extensions
/// changed: maybe not the ad blocker, which the page passes by.
pub fn broadcast_ad_block(state: &State, profile: &Profile) {
    if profile.kind() != ProfileKind::Persistent {
        return;
    }
    let changed = Changed {
        profile_id: &profile.id(),
        ad_block: ad_block::state(profile),
    };
    for window in state.windows.all() {
        let _ = window.page.web_view.send("adBlock.changed", &changed);
    }
}
