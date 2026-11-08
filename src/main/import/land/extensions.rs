// The pins of the extensions brought over: each is pinned in Wren as it is
// in the source's profile it came from. Those it pinned are pinned in its
// order, after those Wren pins already, and the others unpinned, though an
// earlier run pinned them. Chromium gives a new extension its action a
// moment after it installs, and refuses to pin it until then, so a pin it
// refuses waits for the profile's next change to its extensions (`retry`),
// which reports the action.

use std::cell::RefCell;
use std::collections::HashMap;

use wren::{Error, Profile};

thread_local! {
    /// The pins still to make or undo, in order, by the ID of the profile
    /// they're in.
    static WAITING: RefCell<HashMap<String, Vec<(String, bool)>>> = RefCell::default();
}

/// Pins each extension of `pins` in `profile` as the source did: each by
/// its ID, with its place among the source's pins, or none if the source
/// did not pin it.
pub fn pin(profile: &Profile, mut pins: Vec<(String, Option<usize>)>) {
    // Those it did not pin first, then its pins in their order.
    pins.sort_by_key(|(_, place)| *place);
    let pinned = profile.pinned_extensions();
    let changes = pins
        .into_iter()
        .map(|(id, place)| (id, place.is_some()))
        .filter(|(id, pin)| pinned.contains(id) != *pin);
    WAITING.with_borrow_mut(|waiting| {
        waiting.entry(profile.id()).or_default().extend(changes);
    });
    retry(profile);
}

/// Makes the pins waiting in `profile` that Chromium now allows.
pub fn retry(profile: &Profile) {
    let id = profile.id();
    let Some(pins) = WAITING.with_borrow_mut(|waiting| waiting.remove(&id)) else {
        return;
    };
    let left = pin_in_order(profile, pins);
    if !left.is_empty() {
        WAITING.with_borrow_mut(|waiting| waiting.insert(id, left));
    }
}

// Pins or unpins each in turn, and answers those left from the first
// Chromium refused for now, so that the order holds.
fn pin_in_order(profile: &Profile, pins: Vec<(String, bool)>) -> Vec<(String, bool)> {
    for (index, (id, pin)) in pins.iter().enumerate() {
        match profile.set_extension_pinned(id, *pin) {
            // An extension that is on but refused has no action yet.
            Err(Error::NotAllowed)
                if profile.extension_state(id).is_ok_and(|state| state.enabled) =>
            {
                return pins[index..].to_vec();
            }
            Err(Error::Closed) => return Vec::new(),
            // Done, or never can be: turned off, or not installed.
            _ => {}
        }
    }
    Vec::new()
}
