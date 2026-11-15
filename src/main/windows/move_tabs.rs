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
use crate::shell::{Place, WindowId};
use crate::tabs;

impl State {
    /// Brings `moving`, all of one Browser of any window, to window `id`'s
    /// Browser for `place`, at `index` of its list (`tabs::bring_in`), then
    /// calls `done` with that Browser and the tabs as they are there, in
    /// the order of `moving`, or why they did not come: an off-the-record
    /// side of another profile, the Browser they are in, or a page that
    /// kept its tab as it was asked to close for another profile. Should
    /// the window have no Browser for `place` yet, one is made, and the
    /// move waits for it.
    pub fn move_to_place(
        self: &Rc<Self>,
        mt: MainThread,
        id: WindowId,
        moving: Vec<BrowserTab>,
        place: Place,
        index: usize,
        done: impl FnOnce(Result<(Browser, Vec<BrowserTab>), String>) + 'static,
    ) {
        let source = match self.moving_from(&moving, &place) {
            Ok(source) => source,
            Err(error) => return done(Err(error)),
        };
        let state = self.clone();
        self.with_browser_of(mt, id, place.clone(), move |browser| {
            let browser = match browser.and_then(|browser| unmoved(&source, browser, &moving)) {
                Ok(browser) => browser,
                Err(error) => return done(Err(error)),
            };
            let crosses = tabs::crosses_profile(&source, &browser);
            let target = browser.clone();
            tabs::bring_in(mt, &target, &moving, index, move |brought| {
                if crosses && brought.is_ok() {
                    state.show_brought(id, &place);
                }
                done(brought.map(|tabs| (browser, tabs)).map_err(failed));
            });
        });
    }

    /// Whether tabs of `source` that go to `place` are made again there: it
    /// shows another profile, and neither is an off-the-record side, whose
    /// tabs never leave it and which takes none in.
    pub fn remakes_for(&self, source: &Browser, place: &Place) -> Result<bool, String> {
        let from = Place::of_profile(&source.profile().ok_or("There is no such tab.")?);
        let to = self.profile_shown(place)?;
        Ok(from != to && !from.is_off_the_record() && !to.is_off_the_record())
    }

    /// The profile `place` shows, as a place: a space's, or a window's own.
    pub fn profile_shown(&self, place: &Place) -> Result<Place, String> {
        Ok(match place {
            Place::Space(space) => Place::Profile {
                id: self.db.space(*space)?.ok_or("That space is gone.")?.profile,
                off_the_record: false,
            },
            Place::Profile { .. } => place.clone(),
        })
    }

    // The Browser `moving` move from, if they can go to `place`: one of any
    // window's, of the profile `place` shows, or made again in another
    // (`remakes_for`).
    fn moving_from(&self, moving: &[BrowserTab], place: &Place) -> Result<Browser, String> {
        let source = moving
            .first()
            .and_then(|tab| tab.browser())
            .filter(|browser| self.windows.of(browser).is_some())
            .ok_or("There is no such tab.")?;
        let profile = source.profile().ok_or("There is no such tab.")?;
        if Place::of_profile(&profile) != self.profile_shown(place)?
            && !self.remakes_for(&source, place)?
        {
            return Err("A private tab stays in its own profile.".into());
        }
        Ok(source)
    }

    // Shows `place` in window `id`, which tabs made again in another
    // profile have gone to, if it is a space the window is not on.
    fn show_brought(&self, id: WindowId, place: &Place) {
        if let Some(space) = place.space()
            && let Err(error) = self.show_space(id, space)
        {
            eprintln!("Wren could not switch spaces: {error}");
        }
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
