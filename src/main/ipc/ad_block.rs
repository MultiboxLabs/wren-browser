// Each profile's ad blocker (ad_block.rs): whether it is on, and turning it
// on or off, as the Library does. Chromium keeps it, so its extensions page
// turns it on or off too; `adBlock.changed` tells every window either way.

use serde::{Deserialize, Serialize};
use wren::{Browser, MainThread, ProfileKind, WebView};

use super::{WindowRef, failed};
use crate::ad_block::{self, AdBlock};
use crate::app::State;

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

pub fn handle(web_view: &WebView, window: &WindowRef, mt: MainThread) {
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

    // Turns it on or off, and answers with it after, as every window is
    // told.
    let weak = window.clone();
    let _ = web_view.handle_call("adBlock.set", move |call| {
        let state = match weak.state() {
            Ok(state) => state,
            Err(error) => {
                let _ = call.fail(error);
                return;
            }
        };
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
        ad_block::set(mt, &profile_id.clone(), enabled, move |result| {
            let _ = match result {
                Ok(ad_block) => {
                    tell(&state, &profile_id, ad_block);
                    call.answer(&ad_block)
                }
                Err(error) => call.fail(&failed(error)),
            };
        });
    });
}

/// Tells every window's page the ad blocker of the Browser's profile, as the
/// Browser's extensions changed: maybe only a badge, which `tell` passes by.
// TODO: take the Profile of Wren 0.3.0's `ChangeKind::Extensions` (its
// roadmap's item 6), which says once per profile, and for none of the
// badges, that its extensions changed.
pub fn broadcast_ad_block(state: &State, browser: &Browser) {
    let Some(profile) = browser
        .profile()
        .filter(|profile| profile.kind() == ProfileKind::Persistent)
    else {
        return;
    };
    tell(state, &profile.id(), ad_block::state(browser));
}

// Tells every window's page the profile's ad blocker, unless that is what
// they were told last.
// TODO: tell them every time once `broadcast_ad_block` hears only real
// changes (Wren 0.3.0), and drop `State::ad_blocks`.
fn tell(state: &State, profile_id: &str, ad_block: Option<AdBlock>) {
    if state.ad_blocks.borrow().get(profile_id) == Some(&ad_block) {
        return;
    }
    state
        .ad_blocks
        .borrow_mut()
        .insert(profile_id.to_owned(), ad_block);
    let changed = Changed {
        profile_id,
        ad_block,
    };
    for window in state.windows.all() {
        let _ = window.page.web_view.send("adBlock.changed", &changed);
    }
}
