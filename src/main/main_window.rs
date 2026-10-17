// The browser's window: its page, and the Browsers it shows, one for each
// Profile. All are attached to the page's view; one is in front, and the
// rest wait in the background.

use std::cell::RefCell;
use std::collections::HashMap;

use wren::{Browser, Profile};

use crate::window::PageWindow;

pub struct MainWindow {
    pub page: PageWindow,
    // By the Profile's ID.
    browsers: RefCell<HashMap<String, (Profile, Browser)>>,
    front: RefCell<Option<String>>,
}

impl MainWindow {
    pub fn new(page: PageWindow) -> MainWindow {
        MainWindow {
            page,
            browsers: RefCell::default(),
            front: RefCell::default(),
        }
    }

    /// The Browser in front, whose tabs the page shows.
    pub fn browser(&self) -> Option<Browser> {
        let front = self.front.borrow();
        let browsers = self.browsers.borrow();
        front
            .as_ref()
            .and_then(|id| browsers.get(id))
            .map(|(_, browser)| browser.clone())
    }

    /// Whether `browser` is the one in front.
    pub fn is_front(&self, browser: &Browser) -> bool {
        self.browser().as_ref() == Some(browser)
    }

    /// Shows `browser` as its Profile's in this window: in front if the
    /// window has none there yet, otherwise in the background.
    pub fn add(&self, profile: Profile, browser: Browser) {
        browser.attach_to_view(Some(self.page.web_view.view()));
        let id = profile.id();
        let mut front = self.front.borrow_mut();
        if front.is_none() {
            *front = Some(id.clone());
        } else {
            let _ = browser.set_backgrounded(true);
        }
        self.browsers.borrow_mut().insert(id, (profile, browser));
    }

    /// Forgets a Browser that has closed; whether it was this window's.
    pub fn remove(&self, browser: &Browser) -> bool {
        let mut browsers = self.browsers.borrow_mut();
        let Some(id) = browsers
            .iter()
            .find(|(_, (_, each))| each == browser)
            .map(|(id, _)| id.clone())
        else {
            return false;
        };
        browsers.remove(&id);
        let mut front = self.front.borrow_mut();
        if front.as_ref() == Some(&id) {
            // Another comes forward, if there is one.
            *front = browsers.iter().next().map(|(id, (_, browser))| {
                let _ = browser.set_backgrounded(false);
                id.clone()
            });
        }
        true
    }

    pub fn is_empty(&self) -> bool {
        self.browsers.borrow().is_empty()
    }
}
