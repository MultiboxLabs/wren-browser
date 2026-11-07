// The pins of the extensions brought over: each one the source pinned is
// pinned in Wren too, in the source's order, after those Wren pins already.
// Chromium gives a new extension its action a moment after it installs, and
// refuses to pin it until then, so a pin it refuses waits for the profile's
// next change to its extensions (`retry`), which reports the action.

use std::cell::RefCell;
use std::collections::HashMap;

use wren::{Error, Profile};

thread_local! {
    /// The pins still to make, in order, by the ID of the profile they're in.
    static WAITING: RefCell<HashMap<String, Vec<String>>> = RefCell::default();
}

/// Pins the extensions with `ids` in `profile`, in order, after its own.
pub fn pin(profile: &Profile, ids: Vec<String>) {
    let pinned = profile.pinned_extensions();
    let ids = ids.into_iter().filter(|id| !pinned.contains(id));
    WAITING.with_borrow_mut(|waiting| {
        waiting.entry(profile.id()).or_default().extend(ids);
    });
    retry(profile);
}

/// Makes the pins waiting in `profile` that Chromium now allows.
pub fn retry(profile: &Profile) {
    let id = profile.id();
    let Some(ids) = WAITING.with_borrow_mut(|waiting| waiting.remove(&id)) else {
        return;
    };
    let left = pin_in_order(profile, ids);
    if !left.is_empty() {
        WAITING.with_borrow_mut(|waiting| waiting.insert(id, left));
    }
}

// Pins each in turn, and answers those left from the first Chromium refused
// for now, so that the order holds.
fn pin_in_order(profile: &Profile, ids: Vec<String>) -> Vec<String> {
    for (index, id) in ids.iter().enumerate() {
        match profile.set_extension_pinned(id, true) {
            // An extension that is on but refused has no action yet.
            Err(Error::NotAllowed)
                if profile.extension_state(id).is_ok_and(|state| state.enabled) =>
            {
                return ids[index..].to_vec();
            }
            Err(Error::Closed) => return Vec::new(),
            // Pinned, or never can be: turned off, or not installed.
            _ => {}
        }
    }
    Vec::new()
}
