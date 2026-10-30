// Moving tabs from one of a window's spaces to another of the same profile,
// as the sidebar drags them: onto a space's button, or, once the window has
// switched to it, onto its list. They keep their pages and history. A space
// the window has no Browser for gets one first.

use std::rc::Rc;

use wren::{Browser, BrowserTab, MainThread};

use crate::app::State;
use crate::db::SpaceId;
use crate::shell::{Place, WindowId};
use crate::tabs;

impl State {
    /// Moves `moving`, all of one of window `id`'s Browsers, to `space`'s,
    /// at `index` of its list, then calls `done` with that Browser, or why
    /// they did not move: a space of another profile, or the one they are
    /// in. Should the space have no Browser yet, one is made, and the move
    /// waits for it.
    pub fn move_to_space(
        self: &Rc<Self>,
        mt: MainThread,
        id: WindowId,
        moving: Vec<BrowserTab>,
        space: SpaceId,
        index: usize,
        done: impl FnOnce(Result<Browser, String>) + 'static,
    ) {
        let source = match self.moving_from(id, &moving, space) {
            Ok(source) => source,
            Err(error) => return done(Err(error)),
        };
        let place = Place::Space(space);
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

    // The Browser `moving` move from, if they can move to `space`: one of
    // window `id`'s, of another space of the same profile.
    fn moving_from(
        &self,
        id: WindowId,
        moving: &[BrowserTab],
        space: SpaceId,
    ) -> Result<Browser, String> {
        let window = self.windows.get(id).ok_or("The window is closing.")?;
        let source = moving
            .first()
            .and_then(|tab| tab.browser())
            .filter(|browser| window.has_browser(browser))
            .ok_or("There is no such tab.")?;
        let from = window.space_of(&source).ok_or("The tab is in no space.")?;
        if from == space {
            return Err("The tab is in that space already.".into());
        }
        let profile = |space| -> Result<String, String> {
            let row = self.db.space(space)?.ok_or("That space is gone.")?;
            Ok(row.profile)
        };
        if profile(from)? != profile(space)? {
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
    tabs::move_in(&browser, moving, index).map_err(|error| format!("{error:?}"))?;
    Ok(browser)
}
