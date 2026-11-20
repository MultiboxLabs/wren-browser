// Switching a window between its spaces: as the user asks, as Chromium asks
// for a Browser in the background, and as a space it is on is deleted; and
// a window on a profile going with the profile. A window of spaces can also
// leave its space for none, while the user makes one, and come back.

use std::rc::Rc;

use wren::{Browser, MainThread};

use crate::analytics::Event;
use crate::app::State;
use crate::db::SpaceId;
use crate::ipc;
use crate::spaces;
use crate::tabs;
use crate::windows::{self, BrowserWindow, Place, WindowId};

/// Brings `space` forward in window `id`: its Browser if the window has
/// one, or else the space empty, until a tab is opened in it.
pub fn show_space(state: &State, id: WindowId, space: SpaceId) -> Result<(), String> {
    let window = state.windows.get(id).ok_or("The window is closing.")?;
    if window.is_profile_window() {
        return Err("A profile window shows no spaces.".into());
    }
    if state.db.space(space)?.is_none() {
        return Err("That space is gone.".into());
    }
    if window.space() == Some(space) {
        return Ok(());
    }
    leave_front(&window);
    let front = window.switch_to(space);
    windows::save(state, &window);
    spaces::touch(state, space);
    match front {
        Some(browser) => {
            ipc::send_browser(&window, &browser);
            if let Some(tab) = browser.active_tab() {
                tabs::input::give_keyboard(tab);
            }
        }
        None => ipc::send_no_browser(&window),
    }
    windows::update_title(state, &window);
    Ok(())
}

/// Puts window `id` on no space, for the user to make one; the space it
/// was on waits, with its Browser, until the window comes back.
pub fn new_space(state: &State, id: WindowId) -> Result<(), String> {
    let window = state.windows.get(id).ok_or("The window is closing.")?;
    if window.space().is_none() {
        return Err("Only a window on a space can make one.".into());
    }
    leave_front(&window);
    window.leave_for_new_space();
    windows::save(state, &window);
    ipc::send_no_browser(&window);
    windows::update_title(state, &window);
    Ok(())
}

/// Brings window `id` back from no space to the space it left, or if
/// that is gone, to the space used last. A window on a space stays.
pub fn cancel_new_space(state: &State, id: WindowId) -> Result<(), String> {
    let window = state.windows.get(id).ok_or("The window is closing.")?;
    let Some(left) = window.left_space() else {
        return Ok(());
    };
    let space = match state.db.space(left)? {
        Some(_) => left,
        None => spaces::left(state, None)?,
    };
    show_space(state, id, space)
}

/// Chromium asked for `browser`, in the background, to come forward (a
/// notification clicked, an extension): its window switches to its
/// space at once, if it is a space's, and comes to the front. A page
/// that has the window in full screen leaves it as its Browser goes
/// (`leave_front`). A request not acted on, for a Browser no window
/// shows or a switch that failed, is forgotten at once, so nothing
/// acts on it later.
fn bring_forward(state: &State, browser: &Browser) {
    let shown = state.windows.of(browser).and_then(|window| {
        let place = window.place_of(browser)?;
        Some((window, place))
    });
    let Some((window, place)) = shown else {
        let _ = browser.clear_foreground_request();
        return;
    };
    // A window on a profile has only the one Browser, in front already.
    if let Some(space) = place.space()
        && let Err(error) = show_space(state, window.id, space)
    {
        eprintln!("Wren could not switch spaces: {error}");
        let _ = browser.clear_foreground_request();
        return;
    }
    window.page.bring_forward();
}

/// Spaces were deleted, one alone or a profile's with it: each window
/// on one switches to the most recently used space left, of `profile`
/// if given (the deleted space's), and its Browsers of those spaces
/// close with their tabs. A space deleted alone has none left
/// (`spaces::delete`); a profile's closed with the profile.
pub fn leave_gone_spaces(state: &State, profile: Option<&str>) {
    let exists = |space| matches!(state.db.space(space), Ok(Some(_)));
    for window in state.windows.all() {
        if window.space().is_some_and(|current| !exists(current)) {
            let shown =
                spaces::left(state, profile).and_then(|next| show_space(state, window.id, next));
            if let Err(error) = shown {
                eprintln!("Wren could not leave a deleted space: {error}");
            }
        }
        let gone = window
            .kept_spaces()
            .into_iter()
            .filter(|space| !exists(*space));
        for space in gone {
            if let Some(browser) = window.forget(&Place::Space(space)) {
                browser.close(|_| {});
            }
        }
        windows::save(state, &window);
    }
}

/// Profiles were deleted: each window on one goes. Chromium closes their
/// Browsers itself, which leaves the windows. A list that is empty is
/// not loaded yet, as Chromium always has a profile.
pub fn leave_gone_profiles(state: &Rc<State>, mt: MainThread) {
    let listed = mt.profile_list();
    if listed.is_empty() {
        return;
    }
    for window in state.windows.all() {
        let place = window.place();
        let gone = place
            .as_ref()
            .and_then(Place::profile)
            .is_some_and(|id| !listed.iter().any(|profile| profile.id == id));
        if gone {
            windows::close(state, mt, window.id);
        }
    }
}

// The Browser in front is about to leave it: full screen for a page is that
// Browser's, as is the omnibox's query, and the page closes its omnibox as
// the window switches.
fn leave_front(window: &BrowserWindow) {
    if window.wants_full_screen_for_page(false) {
        window.page.set_full_screen(false);
    }
    ipc::stop_omnibox(window);
}

/// Brings `space` forward in window `id`, as the user asks, and counts it.
/// What the app switches for itself is `show_space`, which counts
/// nothing.
pub fn switch_space(state: &State, id: WindowId, space: SpaceId) -> Result<(), String> {
    show_space(state, id, space)?;
    state.analytics.record(Event::SpaceSwitched);
    Ok(())
}

/// Chromium asked for `browser` to come forward. A restore asks for the
/// Browser Chromium had active, which would take the window off the space
/// it was kept on: its request is forgotten, and Chromium's next is
/// reported. Any other is done (`bring_forward`).
pub fn foreground_requested(state: &State, browser: &Browser) {
    if windows::is_restoring(state) {
        let _ = browser.clear_foreground_request();
        return;
    }
    bring_forward(state, browser);
}
