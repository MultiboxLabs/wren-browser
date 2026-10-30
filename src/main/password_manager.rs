// Chromium's password manager, which the user turns on or off for every
// profile at once (`Settings::password_manager`). Chromium keeps it in each
// profile; the app keeps the setting, and each profile is made to follow it
// as it loads, and as the setting changes while it is loaded. A profile that
// is not loaded is left until it is, so none is loaded to be told.

use std::cell::{Cell, RefCell};
use std::collections::HashSet;

use wren::{Error, MainThread, ProfileKind};

thread_local! {
    // The setting, as the app was last told it.
    static ON: Cell<bool> = const { Cell::new(true) };
    // The persistent profiles loaded, by ID.
    static LOADED: RefCell<HashSet<String>> = RefCell::default();
    // Those loaded before the app was ready, which are told once it is.
    static WAITING: RefCell<Vec<String>> = RefCell::default();
}

/// Starts with the setting as it is kept, before any profile loads.
pub fn start(on: bool) {
    ON.set(on);
}

/// Follows a profile as it loads (`App::profile_extensions`): it is told
/// the setting from the event loop, as no Wren call can be made here, or
/// once the app is ready (`ready`). The pages' own, ephemeral profile has
/// no passwords.
pub fn loading(profile_id: &str, kind: ProfileKind) {
    if kind != ProfileKind::Persistent {
        return;
    }
    let id = profile_id.to_owned();
    LOADED.with_borrow_mut(|loaded| loaded.insert(id.clone()));
    let posted = id.clone();
    if wren::post_to_main_thread(move |mt| follow(mt, &posted)).is_err() {
        WAITING.with_borrow_mut(|waiting| waiting.push(id));
    }
}

/// Tells the profiles that loaded before the app was ready.
pub fn ready(mt: MainThread) {
    for id in WAITING.take() {
        follow(mt, &id);
    }
}

/// Forgets a profile that closed: it is told again as it loads again.
pub fn closed(profile_id: &str) {
    LOADED.with_borrow_mut(|loaded| loaded.remove(profile_id));
}

/// Keeps the setting as it changed, and tells every profile loaded.
pub fn set(mt: MainThread, on: bool) {
    ON.set(on);
    for id in LOADED.with_borrow(|loaded| loaded.iter().cloned().collect::<Vec<_>>()) {
        follow(mt, &id);
    }
}

// Turns the password manager of the loaded profile with ID `id` on or off,
// as the setting is, unless it is so already. Policy may keep it as it is,
// which is no error.
fn follow(mt: MainThread, id: &str) {
    mt.open_profile(Some(id), |profile| {
        let on = ON.get();
        let done = profile.and_then(|profile| {
            if profile.password_manager_state()?.on == on {
                return Ok(());
            }
            profile.set_password_manager(on)
        });
        match done {
            Ok(()) | Err(Error::NotAllowed) => {}
            Err(error) => eprintln!("Wren could not set a profile's password manager: {error:?}"),
        }
    });
}
