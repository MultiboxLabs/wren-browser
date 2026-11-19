// Onboarding: a window of its own that the user goes through before the app
// is theirs, on the first run and after Reset Onboarding (the DEVELOPMENT
// menu). Until it is finished no browser window opens, the user's profile
// is not opened, and the main menu has nothing of the browser's; the app
// starts (`State::start`) once it is. Its page is pages/onboarding, which
// says when the user is done (ipc/onboarding.rs). The user may bring their
// things over from another browser in it, as on wren://migrate.

use std::cell::Cell;
use std::rc::Rc;

use serde::Deserialize;
use wren::MainThread;

use crate::app::State;
use crate::db::{FirstSpace, SettingsChange};
use crate::extensions::ad_block;
use crate::import::Landing;
use crate::import::run::{self, Plan, RunState};
use crate::ipc;
use crate::menus;
use crate::pages::ONBOARDING;
use crate::platform::{PageWindow, WindowKind, WindowSize};
use crate::profiles::filling::{self, Filler};
use crate::windows;

/// The window's content, which the user cannot resize, as a setup
/// assistant's.
const SIZE: (f64, f64) = (920.0, 640.0);

/// What the user chose in onboarding, which the app takes as they finish.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Choices {
    /// Their first space's icon and theme; neither if they did not choose
    /// them, as when their spaces come over from another browser.
    pub space: FirstSpace,
    /// Whether ads and trackers are blocked, as they are unless the user
    /// says not: in every profile there is, and in each made after.
    pub ad_block: bool,
    /// Whether Wren saves and fills in passwords in every profile, as it
    /// does unless the user says not: the Password Manager setting.
    pub password_manager: bool,
}

/// The onboarding window, while it is open.
pub fn window(state: &State) -> Option<Rc<PageWindow>> {
    state.onboarding.borrow().clone()
}

/// Opens the onboarding window, which shows itself once its page has
/// drawn. Closing it quits the app, which is not the user's until they
/// are done. False if it could not be opened.
pub(crate) fn open(state: &Rc<State>, mt: MainThread) -> bool {
    let Some(profile) = state.ui_profile.borrow().clone() else {
        return false;
    };
    let Some(web_view) = ONBOARDING.web_view(&profile) else {
        return false;
    };
    let page = Rc::new(PageWindow::open(
        web_view,
        "Welcome to Wren",
        WindowSize::Fixed(SIZE),
        WindowKind::Window,
        move || {
            mt.quit();
            false
        },
    ));
    ipc::handle_onboarding(&page.web_view, state, mt);
    let weak = Rc::downgrade(&page);
    page.watch_active(mt, move |active| {
        if let Some(page) = weak.upgrade() {
            ipc::show_active(&page, active);
        }
    });
    windows::count_crashes(state, &page);
    *state.onboarding.borrow_mut() = Some(page);
    menus::update_main_menu(state, mt);
    true
}

/// The user is done: what they chose is kept, it is noted, and the app
/// starts as it does when there is no onboarding. The window goes once
/// the page's call is over, not inside it.
pub(crate) fn finish(state: &Rc<State>, mt: MainThread, choices: Choices) {
    if state.onboarding.borrow().is_none() {
        return;
    }
    if let Err(error) = state.db.set_first_space(choices.space) {
        eprintln!("Wren could not give the first space what was chosen for it: {error}");
    }
    // Kept as the settings: the ad blocker's as the one a new profile
    // starts with, the first run's too, as onboarding opens none.
    let change = SettingsChange {
        block_ads_in_new_profiles: Some(choices.ad_block),
        password_manager: Some(choices.password_manager),
        ..SettingsChange::default()
    };
    if let Err(error) = state.db.update_settings(change) {
        eprintln!("Wren could not keep the settings chosen in onboarding: {error}");
    }
    // The profiles there are already follow them: those brought over in
    // onboarding, and every one after Reset Onboarding. The password
    // manager is set in those loaded, and the rest follow it as they
    // load (profiles/filling.rs).
    ad_block::set_in_every_profile(mt, choices.ad_block);
    filling::set(mt, Filler::PasswordManager, choices.password_manager);
    if let Err(error) = state.db.set_onboarded(true) {
        eprintln!("Wren could not note that onboarding is done: {error}");
    }
    let weak = Rc::downgrade(state);
    mt.later(move |mt| {
        let Some(state) = weak.upgrade() else { return };
        let Some(window) = state.onboarding.take() else {
            return;
        };
        menus::update_main_menu(&state, mt);
        state.start(mt);
        drop(window);
    });
}

/// Starts bringing `plan` over from onboarding (ipc/migrate.rs), and
/// answers the run as it starts. Each profile lands in a new Wren
/// profile of its name, and the window hears how the run goes
/// (`migrate.progress`). Once the run has brought them over, the profile
/// Wren started on goes, if it has nothing of the user's, as on a first
/// run, and Wren Runtime starts on another (`Wren_OpenProfile(NULL)`).
/// The window hears that the run has finished only once it is gone, so
/// the app never starts on it.
pub(crate) fn import(
    state: &Rc<State>,
    mt: MainThread,
    mut plan: Plan,
) -> Result<RunState, String> {
    if window(state).is_none() {
        return Err("Onboarding is over.".into());
    }
    // A profile the page would bring into the Wren profile of its name
    // gets a new one of that name.
    let listed = mt.profile_list();
    for profile in &mut plan.profiles {
        if let Landing::Existing { id } = &profile.landing
            && let Some(existing) = listed.iter().find(|entry| &entry.id == id)
        {
            profile.landing = Landing::New {
                name: existing.name.clone(),
            };
        }
    }
    let weak = Rc::downgrade(state);
    let deleting = Cell::new(false);
    let watch = Rc::new(move |run: &RunState| {
        let Some(state) = weak.upgrade() else { return };
        if !run.finished || run.stopped {
            tell(&state, run);
        } else if !deleting.replace(true) {
            delete_startup_profile(&state, mt, run.clone());
        }
    });
    run::start(state, None, plan, Some(watch))
}

// Deletes the profile Wren started on if it has nothing of the user's,
// then tells the window that `run` has finished, whether it went or not.
fn delete_startup_profile(state: &Rc<State>, mt: MainThread, run: RunState) {
    let state = state.clone();
    mt.open_profile(None, move |result| {
        let startup = match result {
            Ok(startup) => startup,
            Err(error) => {
                eprintln!("Wren could not open the profile it started on: {error:?}");
                return tell(&state, &run);
            }
        };
        let id = startup.id();
        let empty = state.db.profile_is_empty(&id).unwrap_or_else(|error| {
            eprintln!("Wren could not read the profile it started on: {error}");
            false
        });
        if !empty {
            return tell(&state, &run);
        }
        let deleted = state.clone();
        startup.delete(move |result| {
            match result {
                Ok(()) => {
                    if let Err(error) = deleted.db.forget_profile(&id) {
                        eprintln!("Wren could not forget a profile: {error}");
                    }
                    deleted.db.sync_profiles(&mt.profile_list());
                }
                Err(error) => {
                    eprintln!("Wren could not delete the profile it started on: {error:?}")
                }
            }
            tell(&deleted, &run);
        });
    });
}

// Tells the onboarding window how the run is going.
fn tell(state: &State, run: &RunState) {
    if let Some(page) = window(state) {
        let _ = page.web_view.send("migrate.progress", run);
    }
}

/// Reset Onboarding: the app forgets that the user went through it, and
/// quits, so the next run starts with it again. The windows open now
/// are kept, and come back once it is done.
pub fn reset(state: &State, mt: MainThread) {
    match state.db.set_onboarded(false) {
        Ok(()) => mt.quit(),
        Err(error) => eprintln!("Wren could not reset onboarding: {error}"),
    }
}
