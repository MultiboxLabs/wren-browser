// Chromium's password manager, which the user turns on or off for every
// profile at once (`Settings::password_manager`). Chromium keeps it in each
// profile; the app keeps the setting, and each profile is made to follow it
// as it loads, and as the setting changes while it is loaded. A profile that
// is not loaded is left until it is, so none is loaded to be told.

use std::cell::{Cell, RefCell};
use std::collections::HashSet;

use wren::{Error, MainThread, Profile, ProfileKind};

thread_local! {
    // The setting, as the app was last told it.
    static ON: Cell<bool> = const { Cell::new(true) };
    // The persistent profiles loaded, by ID.
    static LOADED: RefCell<HashSet<String>> = RefCell::default();
}

/// Starts with the setting as it is kept, before any profile loads.
pub fn start(on: bool) {
    ON.set(on);
}

/// Follows a profile Chromium loaded (`ChangeKind::ProfileOpened`), and
/// tells it the setting. The pages' own, ephemeral profile and an
/// off-the-record one have no passwords.
pub fn opened(profile: &Profile) {
    if profile.kind() != ProfileKind::Persistent {
        return;
    }
    LOADED.with_borrow_mut(|loaded| loaded.insert(profile.id()));
    follow(profile);
}

/// Forgets a profile that closed: it is told again as it loads again.
pub fn closed(profile_id: &str) {
    LOADED.with_borrow_mut(|loaded| loaded.remove(profile_id));
}

/// Keeps the setting as it changed, and tells every profile loaded.
pub fn set(mt: MainThread, on: bool) {
    ON.set(on);
    for id in LOADED.with_borrow(|loaded| loaded.iter().cloned().collect::<Vec<_>>()) {
        mt.open_profile(Some(&id), |profile| match profile {
            Ok(profile) => follow(&profile),
            Err(error) => eprintln!("Wren could not set a profile's password manager: {error:?}"),
        });
    }
}

// Turns the profile's password manager on or off, as the setting is, unless
// it is so already. Policy may keep it as it is, which is no error.
fn follow(profile: &Profile) {
    let on = ON.get();
    let done = profile.password_manager_state().and_then(|state| {
        if state.on == on {
            return Ok(());
        }
        profile.set_password_manager(on)
    });
    match done {
        Ok(()) | Err(Error::NotAllowed) => {}
        Err(error) => eprintln!("Wren could not set a profile's password manager: {error:?}"),
    }
}
