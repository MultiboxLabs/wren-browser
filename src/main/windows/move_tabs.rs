// Moving tabs to a place of a window, as the sidebar drags them: from
// another of its spaces, onto a space's button or, once the window has
// switched to it, onto its list; or from another window, onto its sidebar.
// They go only to a place of their own profile, and keep their pages and
// history. A place the window has no Browser for gets one first.

use std::rc::Rc;

use wren::{Browser, BrowserTab, MainThread};

use crate::app::State;
use crate::shell::{Place, WindowId};
use crate::tabs;

impl State {
    /// Moves `moving`, all of one Browser of any window, to window `id`'s
    /// Browser for `place`, at `index` of its list, then calls `done` with
    /// that Browser, or why they did not move: a place of another profile,
    /// or the Browser they are in. Should the window have no Browser for
    /// `place` yet, one is made, and the move waits for it.
    pub fn move_to_place(
        self: &Rc<Self>,
        mt: MainThread,
        id: WindowId,
        moving: Vec<BrowserTab>,
        place: Place,
        index: usize,
        done: impl FnOnce(Result<Browser, String>) + 'static,
    ) {
        let source = match self.moving_from(&moving, &place) {
            Ok(source) => source,
            Err(error) => return done(Err(error)),
        };
        let window = self.windows.get(id);
        if let Some(browser) = window.as_ref().and_then(|w| w.browser_of(&place)) {
            return done(move_into(&source, browser, &moving, index));
        }
        if window.is_some_and(|w| w.is_opening(&place)) {
            return done(Err("That space is still opening.".into()));
        }
        let state = self.clone();
        self.open_browser(mt, id, place.clone(), move || {
            let browser = state.windows.get(id).and_then(|w| w.browser_of(&place));
            let browser = browser.ok_or_else(|| "The space has no Browser.".to_owned());
            done(browser.and_then(|browser| move_into(&source, browser, &moving, index)));
        });
    }

    // The Browser `moving` move from, if they can move to `place`: one of
    // any window's, of the profile `place` shows, or its off-the-record
    // side's for that side.
    fn moving_from(&self, moving: &[BrowserTab], place: &Place) -> Result<Browser, String> {
        let source = moving
            .first()
            .and_then(|tab| tab.browser())
            .filter(|browser| self.windows.of(browser).is_some())
            .ok_or("There is no such tab.")?;
        let profile = source.profile().ok_or("There is no such tab.")?;
        let shown = match place {
            Place::Space(space) => Place::Profile {
                id: self.db.space(*space)?.ok_or("That space is gone.")?.profile,
                off_the_record: false,
            },
            Place::Profile { .. } => place.clone(),
        };
        if Place::of_profile(&profile) != shown {
            return Err("A tab moves only among its profile's spaces.".into());
        }
        Ok(source)
    }
}

// Moves `moving` from `source` to `browser`, if they are all still
// `source`'s, and answers `browser`.
fn move_into(
    source: &Browser,
    browser: Browser,
    moving: &[BrowserTab],
    index: usize,
) -> Result<Browser, String> {
    if moving
        .iter()
        .any(|tab| tab.browser().as_ref() != Some(source))
    {
        return Err("The tabs have moved.".into());
    }
    if browser == *source {
        return Err("The tab is there already.".into());
    }
    tabs::move_in(&browser, moving, index).map_err(|error| format!("{error:?}"))?;
    Ok(browser)
}
