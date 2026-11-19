// Moving a Mini Wren's page to a tab of a window the user browses in (⌘O,
// File's Open as Tab, or its toolbar's Open button), which comes forward on
// it. The Mini Wren's window closes with its Browser.

use std::rc::Rc;

use wren::{BrowserTab, MainThread, Profile};

use crate::app::State;
use crate::db::SpaceId;
use crate::sidebar::items;
use crate::spaces;
use crate::windows::{BrowserWindow, Place, WindowId};
use crate::{ipc, tabs};

impl State {
    /// Moves the page of Mini Wren `id` to a new tab, at the top of the
    /// list and in front (`tabs::bring_in`). The tab is in `space`, as the
    /// user chose it, or else in the space the Mini Wren was opened from,
    /// or the space of the window the user browses in, or its profile's
    /// most recent one, and that window comes forward on it. An
    /// off-the-record page goes only to its profile's off-the-record
    /// window. A window is opened if none shows the place. A page that goes
    /// to another profile is made again there, once the Mini Wren's page
    /// has asked the user (`ipc::ask_before_profile_move`). The Mini Wren's
    /// window closes with its Browser. Fails if `id` is no Mini Wren's, it
    /// is on the New Tab page, which is no page to move, its page has gone,
    /// or a private page is sent to another profile.
    pub fn open_mini_wren_as_tab(
        self: &Rc<Self>,
        mt: MainThread,
        id: WindowId,
        space: Option<SpaceId>,
    ) -> Result<(), String> {
        let window = self.windows.get(id).ok_or("The window is closing.")?;
        let opened_from = window
            .mini_wren()
            .ok_or("The window is no Mini Wren.")?
            .space;
        if window.is_on_new_tab_page() {
            return Err("The Mini Wren has no page to open as a tab.".into());
        }
        let tab = window.active_tab().ok_or("The Mini Wren has no page.")?;
        let source = window.browser().ok_or("The Mini Wren has no page.")?;
        let profile = source.profile().ok_or("The Mini Wren has no page.")?;
        let place = match space {
            Some(space) => Place::Space(space),
            None => self.place_for_mini_wren_page(mt, &profile, opened_from),
        };
        self.may_bring(&source, &place)?;
        let crossing = items::page_crossing(self, &source, &place)?;
        let state = self.clone();
        ipc::ask_before_profile_move(self, id, crossing, move |go| {
            if go {
                state.mini_wren_moved_to_tab(id);
                state.bring_mini_wren_page(mt, tab, place);
            }
        });
        Ok(())
    }

    // Brings a Mini Wren's page, `tab`, to the top of `place`'s list in the
    // window a tab for it goes to, opened if there is none, which comes
    // forward on it.
    fn bring_mini_wren_page(self: &Rc<Self>, mt: MainThread, tab: BrowserTab, place: Place) {
        let target = self
            .window_for_tab(&place)
            .map(|window| window.id)
            .or_else(|| self.open_window(mt, Some(place.clone())));
        let Some(target) = target else {
            return eprintln!("Wren opened no window for the Mini Wren's page.");
        };
        let state = self.clone();
        self.with_browser_of(mt, target, place.clone(), move |browser| {
            let browser = match browser {
                Ok(browser) => browser,
                Err(error) => {
                    return eprintln!("Wren found no Browser for the Mini Wren's page: {error}");
                }
            };
            tabs::bring_in(mt, &browser, &[tab], 0, move |brought| {
                if let Err(error) = brought {
                    return eprintln!(
                        "Wren could not move the Mini Wren's page to a tab: {error:?}"
                    );
                }
                state.show_brought(target, &place);
                if let Some(window) = state.windows.get(target) {
                    window.page.bring_forward();
                }
            });
        });
    }

    // Where a Mini Wren's page becomes a tab: of `profile`, the space the
    // Mini Wren was `opened_from`, that of the window in front, or the most
    // recent, in that order; a profile with no space, or off the record, its
    // own.
    fn place_for_mini_wren_page(
        &self,
        mt: MainThread,
        profile: &Profile,
        opened_from: Option<SpaceId>,
    ) -> Place {
        let own = Place::of_profile(profile);
        if own.is_off_the_record() {
            return own;
        }
        let of_profile = |space: &SpaceId| spaces::is_of(self, *space, profile);
        opened_from
            .filter(of_profile)
            .or_else(|| self.windows.front()?.space().filter(of_profile))
            .or_else(|| spaces::recent(self, mt, profile))
            .map_or(own, Place::Space)
    }

    // The window a tab for `place` goes to: a space's, the window the user
    // browses in if it shows spaces, or else the newest that does; a
    // profile's, the newest window on it. Never one the user is closing,
    // nor one on no space while the user makes one.
    fn window_for_tab(&self, place: &Place) -> Option<Rc<BrowserWindow>> {
        self.windows.taking(|window| {
            !window.is_closing()
                && match place {
                    Place::Space(_) => window.space().is_some(),
                    Place::Profile { .. } => window.place().as_ref() == Some(place),
                }
        })
    }
}
