// Moving tabs to a place of a window, as the sidebar drags them: from
// another of its spaces, onto a space's button or, once the window has
// switched to it, onto its list; or from another window, onto its sidebar.
// Among a profile's places they keep their pages and history. A place of
// another profile gets them made again (tabs/recreate.rs), unless either
// side is off the record, whose tabs never leave it and which takes none
// in. A place the window has no Browser for gets one first.
//
// Tabs made again close first, and a page may ask before it does: its
// window comes to its space to show the "Leave site?" (`bring_forward`).
// Stay leaves it there, on the tab kept. Once they are made again, the
// window they went to shows their space.

use std::rc::Rc;

use wren::{Browser, BrowserTab, Error, MainThread};

use crate::app::State;
use crate::tabs;
use crate::windows::{self, Place, WindowId};

/// Brings `moving`, all of one Browser of any window, to window `id`'s
/// Browser for `place`, at `index` of its list (`tabs::bring_in`), then
/// calls `done` with that Browser and the tabs as they are there, in
/// the order of `moving`, or why they did not come: an off-the-record
/// side of another profile, the Browser they are in, or a page that
/// kept its tab as it was asked to close for another profile. Should
/// the window have no Browser for `place` yet, one is made, and the
/// move waits for it.
pub fn move_to_place(
    state: &Rc<State>,
    mt: MainThread,
    id: WindowId,
    moving: Vec<BrowserTab>,
    place: Place,
    index: usize,
    done: impl FnOnce(Result<(Browser, Vec<BrowserTab>), String>) + 'static,
) {
    let source = match moving_from(state, &moving, &place) {
        Ok(source) => source,
        Err(error) => return done(Err(error)),
    };
    windows::with_browser_of(state, mt, id, place.clone(), {
        let state = state.clone();
        move |browser| {
            let browser = match browser.and_then(|browser| unmoved(&source, browser, &moving)) {
                Ok(browser) => browser,
                Err(error) => return done(Err(error)),
            };
            let crosses = tabs::crosses_profile(&source, &browser);
            let target = browser.clone();
            tabs::bring_in(mt, &target, &moving, index, move |brought| {
                if crosses && brought.is_ok() {
                    show_brought(&state, id, &place);
                }
                done(brought.map(|tabs| (browser, tabs)).map_err(failed));
            });
        }
    });
}

/// Whether tabs of `source` that go to `place` are made again there: it
/// shows another profile, and neither is an off-the-record side, whose
/// tabs never leave it and which takes none in.
pub fn remakes_for(state: &State, source: &Browser, place: &Place) -> Result<bool, String> {
    let from = Place::of_profile(&source.profile().ok_or("There is no such tab.")?);
    let to = profile_shown(state, place)?;
    Ok(from != to && !from.is_off_the_record() && !to.is_off_the_record())
}

/// The profile `place` shows, as a place: a space's, or a window's own.
pub fn profile_shown(state: &State, place: &Place) -> Result<Place, String> {
    Ok(match place {
        Place::Space(space) => Place::Profile {
            id: state
                .db
                .space(*space)?
                .ok_or("That space is gone.")?
                .profile,
            off_the_record: false,
        },
        Place::Profile { .. } => place.clone(),
    })
}

/// Whether tabs of `source` may go to `place`: it shows their profile,
/// or they are made again in another (`remakes_for`). Not to or from an
/// off-the-record side of another profile.
pub fn may_bring(state: &State, source: &Browser, place: &Place) -> Result<(), String> {
    let profile = source.profile().ok_or("There is no such tab.")?;
    if Place::of_profile(&profile) != profile_shown(state, place)?
        && !remakes_for(state, source, place)?
    {
        return Err("A private tab stays in its own profile.".into());
    }
    Ok(())
}

// The Browser `moving` move from, if they can go to `place`: one of any
// window's (`may_bring`).
fn moving_from(state: &State, moving: &[BrowserTab], place: &Place) -> Result<Browser, String> {
    let source = moving
        .first()
        .and_then(|tab| tab.browser())
        .filter(|browser| state.windows.of(browser).is_some())
        .ok_or("There is no such tab.")?;
    may_bring(state, &source, place)?;
    Ok(source)
}

/// Shows `place` in window `id`, which tabs or pins have been brought to
/// from another profile, if it is a space the window is not on.
pub fn show_brought(state: &State, id: WindowId, place: &Place) {
    if let Some(space) = place.space()
        && let Err(error) = windows::show_space(state, id, space)
    {
        eprintln!("Wren could not switch spaces: {error}");
    }
}

// `browser`, if `moving` can still be brought to it: they are all still
// `source`'s, and it is not `source`.
fn unmoved(source: &Browser, browser: Browser, moving: &[BrowserTab]) -> Result<Browser, String> {
    if moving
        .iter()
        .any(|tab| tab.browser().as_ref() != Some(source))
    {
        return Err("The tabs have moved.".into());
    }
    if browser == *source {
        return Err("The tab is there already.".into());
    }
    Ok(browser)
}

// Why tabs did not come, as `move_to_place` says it.
fn failed(error: Error) -> String {
    match error {
        Error::Cancelled => "A page kept its tab.".into(),
        error => format!("{error:?}"),
    }
}
