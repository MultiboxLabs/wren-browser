// Chromium's password manager and its autofill, each of which the user turns
// on or off for every profile at once (`Settings::password_manager` and
// `Settings::autofill`). Chromium keeps both in each profile; the app keeps
// the settings, and each profile is made to follow them as it loads, and as
// a setting changes while it is loaded. A profile that is not loaded is left
// until it is, so none is loaded to be told.
//
// Autofill turned on or off on a profile's chrome://settings is the setting
// changed: the app keeps it, and every other profile follows. Chromium tells
// of no such change to the password manager.

use std::cell::{Cell, RefCell};
use std::collections::HashSet;
use std::thread::LocalKey;

use wren::{Error, MainThread, Profile, ProfileKind};

use crate::app::State;
use crate::db::{Settings, SettingsChange};
use crate::ipc;

/// What Chromium fills in a page, which a setting turns on or off.
#[derive(Clone, Copy, Debug)]
pub enum Filler {
    /// Passwords.
    PasswordManager,
    /// Addresses, payment methods and the values typed before in a field.
    Autofill,
}

thread_local! {
    // Each setting, as the app was last told it.
    static PASSWORD_MANAGER: Cell<bool> = const { Cell::new(true) };
    static AUTOFILL: Cell<bool> = const { Cell::new(true) };
    // The persistent profiles loaded, by ID.
    static LOADED: RefCell<HashSet<String>> = RefCell::default();
}

// A filler as a profile has it.
struct InProfile {
    on: bool,
    // Policy sets it, and the profile refuses to change it.
    managed: bool,
}

impl Filler {
    const ALL: [Filler; 2] = [Filler::PasswordManager, Filler::Autofill];

    // For the errors Wren prints.
    fn name(self) -> &'static str {
        match self {
            Filler::PasswordManager => "password manager",
            Filler::Autofill => "autofill",
        }
    }

    // Its setting, as the app was last told it.
    fn setting(self) -> &'static LocalKey<Cell<bool>> {
        match self {
            Filler::PasswordManager => &PASSWORD_MANAGER,
            Filler::Autofill => &AUTOFILL,
        }
    }

    fn in_profile(self, profile: &Profile) -> Result<InProfile, Error> {
        match self {
            Filler::PasswordManager => profile.password_manager_state().map(|state| InProfile {
                on: state.on,
                managed: state.managed,
            }),
            Filler::Autofill => profile.autofill_state().map(|state| InProfile {
                on: state.on,
                managed: state.managed,
            }),
        }
    }

    fn set_in(self, profile: &Profile, on: bool) -> Result<(), Error> {
        match self {
            Filler::PasswordManager => profile.set_password_manager(on),
            Filler::Autofill => profile.set_autofill(on),
        }
    }
}

/// Starts with the settings as they are kept, before any profile loads.
pub fn start(settings: &Settings) {
    PASSWORD_MANAGER.set(settings.password_manager);
    AUTOFILL.set(settings.autofill);
}

/// Follows a profile Chromium loaded (`ChangeKind::ProfileOpened`), and
/// tells it the settings. The pages' own, ephemeral profile fills nothing,
/// and an off-the-record profile follows its original.
pub fn opened(profile: &Profile) {
    if profile.kind() != ProfileKind::Persistent {
        return;
    }
    LOADED.with_borrow_mut(|loaded| loaded.insert(profile.id()));
    for filler in Filler::ALL {
        follow(filler, profile);
    }
}

/// Forgets a profile that closed: it is told again as it loads again.
pub fn closed(profile_id: &str) {
    LOADED.with_borrow_mut(|loaded| loaded.remove(profile_id));
}

/// Keeps a setting as it changed, and tells every profile loaded.
pub fn set(mt: MainThread, filler: Filler, on: bool) {
    filler.setting().set(on);
    let loaded: Vec<String> = LOADED.with_borrow(|loaded| loaded.iter().cloned().collect());
    for id in loaded {
        mt.open_profile(Some(&id), move |profile| match profile {
            Ok(profile) => follow(filler, &profile),
            Err(error) => eprintln!("Wren could not set a profile's {}: {error:?}", filler.name()),
        });
    }
}

/// Takes autofill turned on or off in `profile` (`ChangeKind::Autofill`).
/// One the app did not turn so was turned so on chrome://settings: it is
/// the setting changed, which every window is told of and every profile
/// follows. Where policy sets it, it is that profile's alone.
pub fn autofill_changed(state: &State, mt: MainThread, profile: &Profile) {
    if !LOADED.with_borrow(|loaded| loaded.contains(&profile.id())) {
        return;
    }
    let Ok(now) = Filler::Autofill.in_profile(profile) else {
        return;
    };
    if now.managed || now.on == AUTOFILL.get() {
        return;
    }
    let change = SettingsChange {
        autofill: Some(now.on),
        ..SettingsChange::default()
    };
    let settings = match state.db.update_settings(change) {
        Ok(settings) => settings,
        Err(error) => {
            eprintln!("Wren could not keep the autofill setting: {error}");
            return;
        }
    };
    ipc::broadcast_settings(state, &settings);
    set(mt, Filler::Autofill, now.on);
}

// Turns `filler` on or off in the profile, as its setting is, unless it is
// so already. Policy may keep it as it is, which is no error.
fn follow(filler: Filler, profile: &Profile) {
    let on = filler.setting().get();
    let done = filler.in_profile(profile).and_then(|now| {
        if now.on == on {
            return Ok(());
        }
        filler.set_in(profile, on)
    });
    match done {
        Ok(()) | Err(Error::NotAllowed) => {}
        Err(error) => eprintln!("Wren could not set a profile's {}: {error:?}", filler.name()),
    }
}
