// What macOS asks the app to open: a link clicked in another app while Wren
// is the default browser, or a page opened with it. Each opens in a new tab
// of the window the user browses in, which comes forward. A link that
// launches the app comes before its windows have their Browsers, and one
// may come while a profile's last session is being restored, which brings
// forward what it had active: either is held, and opens once the window
// has its Browser (`open_browser`) and nothing is being restored.

use std::rc::Rc;

use wren::MainThread;

use crate::app::State;
use crate::shell::BrowserWindow;
use crate::tabs;

impl State {
    /// Opens `urls` in new tabs, now or once the app can.
    pub fn open_urls(self: &Rc<Self>, mt: MainThread, urls: &[String]) {
        self.held_urls.borrow_mut().extend_from_slice(urls);
        self.open_held_urls(mt);
    }

    /// Opens the links held, if the app can now: in the window the user
    /// browses in, if it has its Browser; else the Browser is made, and
    /// they open as it is shown. With no window to open them in, one opens
    /// on the space used last, as the Dock icon's does.
    pub(super) fn open_held_urls(self: &Rc<Self>, mt: MainThread) {
        // Not before startup opens the windows, nor while restoring.
        if self.held_urls.borrow().is_empty()
            || self.ui_profile.borrow().is_none()
            || self.is_restoring()
        {
            return;
        }
        let Some(window) = self.link_window() else {
            return self.open_recent_window(mt);
        };
        let Some(browser) = window.browser() else {
            // A place without one gets one, unless it is on the way; a
            // window that waits for its first has it on the way.
            if let Some(place) = window.place() {
                self.open_browser(mt, window.id, place, || {});
            }
            return;
        };
        let urls = self.held_urls.take();
        // The first link ends up first in the list, and in front.
        for url in urls.iter().rev() {
            if let Err(error) = tabs::open(&browser, url) {
                eprintln!("Wren could not open a link: {error:?}");
            }
        }
        window.page.bring_forward();
    }

    // The window links open in: the one the user browses in, or else the
    // newest other. Never a popup's, nor off the record, as Chromium opens
    // them in a normal window; nor one on no space while the user makes one.
    fn link_window(&self) -> Option<Rc<BrowserWindow>> {
        let takes = |window: &Rc<BrowserWindow>| {
            !window.is_popup()
                && !window.is_closing()
                && window.left_space().is_none()
                && !window
                    .place()
                    .is_some_and(|place| place.is_off_the_record())
        };
        self.windows.front().filter(takes).or_else(|| {
            let mut all = self.windows.all();
            all.reverse();
            all.into_iter().find(takes)
        })
    }
}
