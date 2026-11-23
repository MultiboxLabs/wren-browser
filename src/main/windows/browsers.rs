// Where each Browser goes, and getting it there: one the app makes for a
// window's place, and one Chromium opens, which goes back where it was if
// it was restored, or else gets a window of its own (open.rs).

use std::rc::Rc;

use wren::{Browser, MainThread, Profile, ProfileKind};

use crate::app::State;
use crate::db::SpaceId;
use crate::ipc;
use crate::spaces;
use crate::tabs::placeholder;
use crate::windows::{self, BrowserWindow, Place, WindowId};

/// Calls `then` with window `id`'s Browser for `place`, making one first
/// (`open_browser`) if it has none, or with why it has none: the window
/// is closing, or the place's Browser is still on its way.
pub fn with_browser_of(
    state: &Rc<State>,
    mt: MainThread,
    id: WindowId,
    place: Place,
    then: impl FnOnce(Result<Browser, String>) + 'static,
) {
    let Some(window) = state.windows.get(id) else {
        return then(Err("The window is closing.".into()));
    };
    if let Some(browser) = window.browser_of(&place) {
        return then(Ok(browser));
    }
    if window.is_opening(&place) {
        return then(Err("That space is still opening.".into()));
    }
    open_browser(state, mt, id, place.clone(), {
        let state = state.clone();
        move || {
            let browser = state.windows.get(id).and_then(|w| w.browser_of(&place));
            then(browser.ok_or_else(|| "The space has no Browser.".to_owned()));
        }
    });
}

/// Makes window `id` a Browser for `place`, with no tab yet but its
/// placeholder (tabs/placeholder.rs), unless it has one or one is on the
/// way; `then` runs once it is shown. A place whose Browser could not be
/// made stays without one.
pub fn open_browser(
    state: &Rc<State>,
    mt: MainThread,
    id: WindowId,
    place: Place,
    then: impl FnOnce() + 'static,
) {
    let Some(window) = state.windows.get(id) else {
        return;
    };
    if !window.set_opening(&place) {
        return;
    }
    open_profile_of(state, mt, place.clone(), {
        let state = state.clone();
        move |result| {
            let profile = match result {
                Ok(profile) => profile,
                Err(error) => return failed_browser(&state, id, &place, &error),
            };
            placeholder::create_browser(&profile, move |result| {
                let browser = match result {
                    Ok(browser) => browser,
                    Err(error) => return failed_browser(&state, id, &place, &format!("{error:?}")),
                };
                // A window closed in the meantime takes no Browser, nor a
                // space's that was deleted.
                let window = state.windows.get(id);
                let Some(window) = window.filter(|w| !w.is_closing() && w.is_opening(&place))
                else {
                    browser.close(|_| {});
                    return;
                };
                host(&state, &window, place, &browser);
                then();
                // Tabs held for want of a Browser open now (held_tabs.rs).
                windows::open_held(&state, mt);
            });
        }
    });
}

/// Calls `then` with the profile `place` is on, opened: a space's, by
/// its row, or the profile's own, or its off-the-record side; or with
/// why there is none.
pub(super) fn open_profile_of(
    state: &State,
    mt: MainThread,
    place: Place,
    then: impl FnOnce(Result<Profile, String>) + 'static,
) {
    let (profile, off_the_record) = match place {
        Place::Space(space) => match state.db.space(space) {
            Ok(Some(row)) => (row.profile, false),
            Ok(None) => return then(Err("The space is gone.".into())),
            Err(error) => return then(Err(error)),
        },
        Place::Profile { id, off_the_record } => (id, off_the_record),
    };
    mt.open_profile(Some(&profile), move |result| {
        let result = match off_the_record {
            true => result.and_then(|profile| profile.off_the_record()),
            false => result,
        };
        then(result.map_err(|error| format!("{error:?}")));
    });
}

fn failed_browser(state: &State, id: WindowId, place: &Place, error: &str) {
    eprintln!("Wren opened no Browser: {error}");
    if let Some(window) = state.windows.get(id) {
        window.forget(place);
    }
}

/// Shows a Browser Chromium opened: a restored one back where it was
/// (`place_tagged`), and any other (a link opened in a new window) in a
/// window of its own, on the space it came from: its opener's, or else
/// that of the window in front, as New Window's, if either is of its
/// profile; otherwise its profile's most recently used space. A profile
/// with no space gets a window on the profile. At startup, it goes in
/// the window that waits for its first. Chromium names the opener of a
/// link opened in a new window, noopener or not. An off-the-record one
/// gets an
/// off-the-record window of its own.
pub fn place_opened(state: &Rc<State>, mt: MainThread, browser: Browser, opener: Option<Browser>) {
    let Some(profile) = browser.profile() else {
        browser.close(|_| {});
        return;
    };
    if profile.kind() == ProfileKind::OffTheRecord {
        host_opened(state, mt, &browser, Place::of_profile(&profile), None);
        return;
    }
    if windows::place_tagged(state, &browser, &profile) {
        return;
    }
    if windows::is_left_by_closed_window(state, &browser) {
        browser.close(|_| {});
        return;
    }
    let of_profile = |space: &SpaceId| spaces::is_of(state, *space, &profile);
    let space = opener
        .and_then(|opener| state.windows.of(&opener)?.space_opened_from(&opener))
        .filter(of_profile)
        .or_else(|| state.windows.front()?.space().filter(of_profile))
        .or_else(|| spaces::recent(state, mt, &profile));
    let place = space.map_or_else(|| Place::of_profile(&profile), Place::Space);
    placeholder::adopt(&browser);
    if host_opened(state, mt, &browser, place, state.windows.waiting())
        && let Some(space) = space
    {
        spaces::touch(state, space);
    }
}

// Shows a Browser Chromium opened on `place`, in `window`, or else in a
// window of its own. One that gets no window closes. Whether it got one.
fn host_opened(
    state: &Rc<State>,
    mt: MainThread,
    browser: &Browser,
    place: Place,
    window: Option<Rc<BrowserWindow>>,
) -> bool {
    let window = window.or_else(|| {
        let id = windows::open(state, mt, Some(place.clone()))?;
        state.windows.get(id)
    });
    let Some(window) = window else {
        browser.close(|_| {});
        return false;
    };
    host_as_requested(state, &window, place, browser);
    true
}

/// Shows `browser` as `window`'s for `place`, in front if that is its
/// current place, and keeps the window as it is now.
fn host(state: &State, window: &BrowserWindow, place: Place, browser: &Browser) {
    window.add(place, browser.clone());
    if window.is_front(browser) {
        ipc::send_browser(window, browser);
        windows::update_title(state, window);
    } else {
        ipc::send_tabs(window, browser);
    }
    windows::save(state, window);
}

// Shows a Browser Chromium opened or restored, as `host` does, in the
// state Chromium wants its window in.
pub(super) fn host_as_requested(
    state: &State,
    window: &BrowserWindow,
    place: Place,
    browser: &Browser,
) {
    host(state, window, place, browser);
    windows::start_as_requested(window, browser);
}
