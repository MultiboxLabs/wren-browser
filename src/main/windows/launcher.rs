// A Mini Wren on the New Tab page is a launcher: the omnibox alone, as large
// as the window, with no toolbar and no window buttons (pages/ui/popup.tsx).
// The window draws nothing of its own, so the omnibox is all that shows. An
// empty Mini Wren opens on the New Tab page, so it opens as one
// (mini_wren.rs). What the omnibox opens loads in the Mini Wren's page,
// which leaves the New Tab page: the window becomes a popup's again, and
// grows down from its top to a page's size. A page that goes back to the
// New Tab page makes it a launcher again. A launcher closes as it goes out
// of use, when the user goes to another window or app, as it does when the
// omnibox closes (pages/ui/launcher.tsx).

use std::rc::Rc;

use wren::{Browser, MainThread};

use super::popup::{SCREEN_MARGIN, popup_window_size};
use crate::app::State;
use crate::ipc;
use crate::shell::{BrowserWindow, Popup};
use crate::tabs;

/// The room round a launcher's omnibox for the shadow it draws, which the
/// window draws none of, in points on each side.
const SHADOW_ROOM: f64 = 40.0;

/// A launcher's window: the omnibox's size in the middle of a window, with
/// room round it for its shadow (`sizes.center` and `SHADOW_ROOM`,
/// components/omnibox/omnibox.tsx). Change them together.
const LAUNCHER_SIZE: (f64, f64) = (763.0 + 2.0 * SHADOW_ROOM, 326.0 + 2.0 * SHADOW_ROOM);

/// Draws a popup's new `window` on `browser` as a launcher if its page is
/// the New Tab page, before it is placed and long before it shows, and
/// answers the size to give it.
pub(super) fn draw_new(window: &BrowserWindow, browser: &Browser) -> (f64, f64) {
    let launcher = window
        .popup()
        .is_some_and(|popup| is_launcher(popup, browser) == Some(true));
    window.set_launcher(launcher);
    if launcher {
        window.page.set_see_through(true);
    }
    window_size(launcher, browser)
}

// Whether a popup on `browser` is a launcher: it shows its address, and its
// page is the New Tab page. None while the page has no address yet, as a
// page's popup has none at first, which leaves the window as it is.
fn is_launcher(popup: Popup, browser: &Browser) -> Option<bool> {
    let url = browser.active_tab()?.url();
    (!url.is_empty()).then(|| popup.address && tabs::is_new_tab(&url))
}

// The size of a popup's window on `browser`, drawn as a launcher or not.
fn window_size(launcher: bool, browser: &Browser) -> (f64, f64) {
    if launcher {
        LAUNCHER_SIZE
    } else {
        popup_window_size(browser)
    }
}

impl State {
    /// Draws popup `window` as a launcher, or as a popup's again, once its
    /// page has gone to the New Tab page or left it, and the main menu
    /// follows. Nothing for a browser window.
    pub fn follow_launcher(&self, mt: MainThread, window: &BrowserWindow) {
        let Some((popup, browser)) = window.popup().zip(window.browser()) else {
            return;
        };
        let Some(launcher) = is_launcher(popup, &browser) else {
            return;
        };
        if !window.set_launcher(launcher) {
            return;
        }
        window.page.set_see_through(launcher);
        window
            .page
            .resize_popup_from_top(window_size(launcher, &browser), SCREEN_MARGIN);
        ipc::send_launcher(window);
        self.update_front_menu(mt);
    }

    /// Window `window` went out of use, having been in use: a launcher
    /// closes, and leaves the user where they went.
    pub(super) fn launcher_left(self: &Rc<Self>, mt: MainThread, window: &BrowserWindow) {
        if window.is_launcher() {
            self.close_window(mt, window.id);
        }
    }
}
