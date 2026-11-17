// Popups, which the user knows as Mini Wren. A Browser Chromium opens that
// is not a tabbed window gets a small browser window of its own: a page's
// popup (`window.open` with features, as a sign-in opens), an extension's
// popup window, or an installed app's window. A link from another app opens
// in one too (open_urls.rs). The page draws its toolbar, whose address
// opens the omnibox for its page, and no sidebar (pages/ui/popup.tsx). It is
// on its profile's place, and never kept: its Browser closing takes it
// (`App::browser_closed`). Its page can move to a tab of a window the user
// browses in (`open_popup_as_tab`). Document
// Picture-in-Picture is none of these: Chromium shows it in a window of its
// own, with no Browser.

use std::rc::Rc;

use wren::{Browser, BrowserTab, MainThread, Profile, WindowFeatures};

use super::session::unkept_window_key;
use crate::app::State;
use crate::db::SpaceId;
use crate::shell::{BrowserWindow, Place, Popup, WindowId};
use crate::{ipc, items, tabs};

/// The height of a popup's toolbar, in points, which the page draws above
/// its page (pages/ui/popup.tsx). The size a page asks for is its own, so
/// the window is this much taller.
const TOOLBAR: f64 = 40.0;

/// The size of a popup's page that asked for none.
pub(super) const PAGE_SIZE: (f64, f64) = (800.0, 600.0);

/// A popup's window's minimum, its toolbar in it, however small its page
/// asks to be: room for the window's buttons, some of the address, and the
/// button that opens the page as a tab with its key and its menu of spaces.
pub(super) const POPUP_MIN_SIZE: (f64, f64) = (400.0, 160.0);

impl State {
    /// Shows `browser`, which `opener` opened if Chromium names it, in a
    /// popup's window (`show_popup`), from the space its opener's window
    /// opened it from, and cascaded from that window.
    pub fn open_popup(self: &Rc<Self>, mt: MainThread, browser: Browser, opener: Option<Browser>) {
        let opener_window = opener.as_ref().and_then(|opener| self.windows.of(opener));
        let space = opener_window
            .as_ref()
            .zip(opener.as_ref())
            .and_then(|(window, opener)| window.space_opened_from(opener));
        self.show_popup(mt, browser, space, opener_window);
    }

    /// Shows `browser` in a popup's window, from `space`: as large as its
    /// page asked, where it asked if a screen shows it there, or else
    /// cascaded from `near`, or the window in front. One that gets no window
    /// closes. Answers the window's ID.
    pub(super) fn show_popup(
        self: &Rc<Self>,
        mt: MainThread,
        browser: Browser,
        space: Option<SpaceId>,
        near: Option<Rc<BrowserWindow>>,
    ) -> Option<WindowId> {
        let Some(profile) = browser.profile() else {
            browser.close(|_| {});
            return None;
        };
        let popup = Popup {
            space,
            address: browser
                .window_features()
                .contains(WindowFeatures::LOCATION_BAR),
        };
        let place = Place::of_profile(&profile);
        let window = self.open_page_window(
            mt,
            unkept_window_key(),
            Some(place.clone()),
            true,
            Some(popup),
        );
        let Some(window) = window else {
            browser.close(|_| {});
            return None;
        };
        let requested = browser.requested_bounds();
        let (width, height) = requested.map_or(PAGE_SIZE, |bounds| (bounds.width, bounds.height));
        let near = near.or_else(|| self.windows.front());
        window.page.place_popup(
            (width, height + TOOLBAR),
            requested.and_then(|bounds| bounds.origin),
            near.as_ref().map(|near| &near.page),
        );
        self.host_as_requested(&window, place, &browser);
        Some(window.id)
    }

    /// Moves the page of popup window `id` to a new tab, at the top of the
    /// list and in front (`tabs::bring_in`). The tab is in `space`, as the
    /// user chose it, or else in the space the popup was opened from, or the
    /// space of the window the user browses in, or its profile's most recent
    /// one, and that window comes forward on it. An off-the-record page goes
    /// only to its profile's off-the-record window. A window is opened if
    /// none shows the place. A page that goes to another profile is made
    /// again there, once the popup's page has asked the user
    /// (`ipc::ask_before_profile_move`). The popup's window closes with its
    /// Browser. Fails if `id` is no popup's, its page has gone, or a private
    /// page is sent to another profile.
    pub fn open_popup_as_tab(
        self: &Rc<Self>,
        mt: MainThread,
        id: WindowId,
        space: Option<SpaceId>,
    ) -> Result<(), String> {
        let popup = self.windows.get(id).ok_or("The window is closing.")?;
        let opened_from = popup.popup().ok_or("The window is no popup's.")?.space;
        let tab = popup.active_tab().ok_or("The popup has no page.")?;
        let source = popup.browser().ok_or("The popup has no page.")?;
        let profile = source.profile().ok_or("The popup has no page.")?;
        let place = match space {
            Some(space) => Place::Space(space),
            None => self.place_for_popup(mt, &profile, opened_from),
        };
        self.may_bring(&source, &place)?;
        let crossing = items::page_crossing(self, &source, &place)?;
        let state = self.clone();
        ipc::ask_before_profile_move(self, id, crossing, move |go| {
            if go {
                state.popup_moved_to_tab(id);
                state.bring_popup_page(mt, tab, place);
            }
        });
        Ok(())
    }

    // Brings a popup's page, `tab`, to the top of `place`'s list in the
    // window a tab for it goes to, opened if there is none, which comes
    // forward on it.
    fn bring_popup_page(self: &Rc<Self>, mt: MainThread, tab: BrowserTab, place: Place) {
        let target = self
            .window_for_tab(&place)
            .map(|window| window.id)
            .or_else(|| self.open_window(mt, Some(place.clone())));
        let Some(target) = target else {
            return eprintln!("Wren opened no window for the popup's page.");
        };
        let state = self.clone();
        self.with_browser_of(mt, target, place.clone(), move |browser| {
            let browser = match browser {
                Ok(browser) => browser,
                Err(error) => {
                    return eprintln!("Wren found no Browser for the popup's page: {error}");
                }
            };
            tabs::bring_in(mt, &browser, &[tab], 0, move |brought| {
                if let Err(error) = brought {
                    return eprintln!("Wren could not move the popup's page to a tab: {error:?}");
                }
                state.show_brought(target, &place);
                if let Some(window) = state.windows.get(target) {
                    window.page.bring_forward();
                }
            });
        });
    }

    // Where a popup's page becomes a tab: of `profile`, the space the popup
    // was `opened_from`, that of the window in front, or the most recent,
    // in that order; a profile with no space, or off the record, its own.
    fn place_for_popup(
        &self,
        mt: MainThread,
        profile: &Profile,
        opened_from: Option<SpaceId>,
    ) -> Place {
        let own = Place::of_profile(profile);
        if own.is_off_the_record() {
            return own;
        }
        let of_profile = |space: &SpaceId| self.is_space_of(*space, profile);
        opened_from
            .filter(of_profile)
            .or_else(|| self.windows.front()?.space().filter(of_profile))
            .or_else(|| self.recent_space(mt, profile))
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
