// The app's own pages a menu item shows, such as Import: each opens in a new
// tab of the window the user browses in, or brings forward the tab that has
// one already. A page is held until startup and the restore are done
// (`open_held`), and until that window has its Browser (`open_browser`).

use std::rc::Rc;

use wren::MainThread;

use crate::app::State;
use crate::pages::Page;
use crate::tabs;

impl State {
    /// Shows the app's own `page` in the window the user browses in: the tab
    /// there on it, if one is, or else a new one.
    pub fn show_page(self: &Rc<Self>, mt: MainThread, page: &Page) {
        let url = page.url();
        let window = self.browsing_window();
        let tab = window
            .as_ref()
            .and_then(|window| window.browser())
            .and_then(|browser| {
                browser
                    .tabs()
                    .into_iter()
                    .find(|tab| tab.url().starts_with(&url))
            });
        match (window, tab) {
            (Some(window), Some(tab)) => {
                if let Err(error) = tab.activate() {
                    eprintln!("Wren could not show {url}: {error:?}");
                }
                window.page.bring_forward();
            }
            _ => {
                self.held_pages.borrow_mut().push(url);
                self.open_held(mt);
            }
        }
    }

    /// Opens the pages held in the window the user browses in, if it has its
    /// Browser; else the Browser is made, and they open as it is shown. With
    /// no window to open them in, one opens on the space used last, as the
    /// Dock icon's does.
    pub(super) fn open_held_pages(self: &Rc<Self>, mt: MainThread) {
        if self.held_pages.borrow().is_empty() {
            return;
        }
        let Some(window) = self.browsing_window() else {
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
        let urls = self.held_pages.take();
        // The first ends up first in the list, and in front.
        for url in urls.iter().rev() {
            if let Err(error) = tabs::open(&browser, url) {
                eprintln!("Wren could not open {url}: {error:?}");
            }
        }
        window.page.bring_forward();
    }
}
