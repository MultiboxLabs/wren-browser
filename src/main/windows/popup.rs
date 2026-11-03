// Popups. A Browser Chromium opens that is not a tabbed window gets a
// browser window of its own: a page's popup (`window.open` with features,
// as a sign-in opens), an extension's popup window, or an installed app's
// window. Its title bar is the system's, under which the page draws a page's
// popup's address, and no sidebar (pages/ui/popup.tsx). It is on its
// profile's place, and never kept: its Browser closing takes it
// (`App::browser_closed`). Document Picture-in-Picture is none of these:
// Chromium shows it in a window of its own, with no Browser.

use std::rc::Rc;

use wren::{Browser, MainThread, WindowFeatures};

use super::session::unkept_window_key;
use crate::app::State;
use crate::shell::{Place, Popup};

/// The height of a popup's address bar, in points, which the page draws
/// above its page (pages/ui/popup.tsx). The size a page asks for is its
/// own, so the window is this much taller.
const ADDRESS_BAR: f64 = 40.0;

/// The size of a popup's page that asked for none.
const PAGE_SIZE: (f64, f64) = (800.0, 600.0);

/// A popup's window's minimum, its address bar in it, however small its
/// page asks to be: room for the address bar's text.
pub(super) const POPUP_MIN_SIZE: (f64, f64) = (240.0, 120.0);

impl State {
    /// Shows `browser`, which `opener` opened if Chromium names it, in a
    /// popup's window: as large as its page asked, where it asked if a
    /// screen shows it there, or else cascaded from its opener's window, or
    /// the window in front. One that gets no window closes.
    pub fn open_popup(self: &Rc<Self>, mt: MainThread, browser: Browser, opener: Option<Browser>) {
        let Some(profile) = browser.profile() else {
            browser.close(|_| {});
            return;
        };
        let opener_window = opener.as_ref().and_then(|opener| self.windows.of(opener));
        let popup = Popup {
            space: opener_window
                .as_ref()
                .zip(opener.as_ref())
                .and_then(|(window, opener)| window.space_opened_from(opener)),
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
            return;
        };
        let requested = browser.requested_bounds();
        let (width, height) = requested.map_or(PAGE_SIZE, |bounds| (bounds.width, bounds.height));
        let bar = if popup.address { ADDRESS_BAR } else { 0.0 };
        let near = opener_window.or_else(|| self.windows.front());
        window.page.place_popup(
            (width, height + bar),
            requested.and_then(|bounds| bounds.origin),
            near.as_ref().map(|near| &near.page),
        );
        self.host_as_requested(&window, place, &browser);
    }
}
