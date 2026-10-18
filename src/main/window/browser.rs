// A browser window: its page, and the Browsers it shows, one for each
// Profile. All are attached to the page's view; one is in front, and the
// rest wait in the background.

use std::cell::{Cell, RefCell};
use std::collections::HashMap;

use wren::{Browser, BubbleAnchor, Profile};

use super::PageWindow;

/// The page's mark on its page info button, which the site's bubbles (page
/// info, permission prompts), the extensions menu and unpinned extensions'
/// popups hang off. A pinned extension's button is marked
/// "extension:<id>" (address-field.tsx).
const PAGE_INFO: &str = "page-info";

/// Tells a window from the others for as long as the app runs.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub struct WindowId(pub u64);

pub struct BrowserWindow {
    pub id: WindowId,
    pub page: PageWindow,
    // By the Profile's ID.
    browsers: RefCell<HashMap<String, (Profile, Browser)>>,
    front: RefCell<Option<String>>,
    // Whether the window went full screen for a page, and comes back once
    // the page is done; not so for full screen the user chose.
    full_screen_for_page: Cell<bool>,
}

impl BrowserWindow {
    pub fn new(id: WindowId, page: PageWindow) -> BrowserWindow {
        BrowserWindow {
            id,
            page,
            browsers: RefCell::default(),
            front: RefCell::default(),
            full_screen_for_page: Cell::default(),
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

    /// The Profile of the Browser in front.
    pub fn profile(&self) -> Option<Profile> {
        let front = self.front.borrow();
        let browsers = self.browsers.borrow();
        front
            .as_ref()
            .and_then(|id| browsers.get(id))
            .map(|(profile, _)| profile.clone())
    }

    /// Whether `browser` is one of the window's.
    pub fn has_browser(&self, browser: &Browser) -> bool {
        self.browsers
            .borrow()
            .values()
            .any(|(_, each)| each == browser)
    }

    /// Closes the window's Browsers. The window goes as the last of them
    /// closes (`remove`).
    pub fn close_browsers(&self) {
        let browsers: Vec<Browser> = self
            .browsers
            .borrow()
            .values()
            .map(|(_, browser)| browser.clone())
            .collect();
        for browser in browsers {
            let _ = browser.close();
        }
    }

    /// Whether `browser` is the one in front.
    pub fn is_front(&self, browser: &Browser) -> bool {
        self.browser().as_ref() == Some(browser)
    }

    /// Shows `browser` as its Profile's in this window: in front if the
    /// window has none there yet, otherwise in the background.
    pub fn add(&self, profile: Profile, browser: Browser) {
        browser.attach_to_view(Some(self.page.web_view.view()));
        self.name_anchors(&browser);
        // Its pages take a window that is full screen already without asking.
        if self.page.is_full_screen() {
            let _ = browser.set_fullscreen(true);
        }
        let id = profile.id();
        let mut front = self.front.borrow_mut();
        if front.is_none() {
            *front = Some(id.clone());
            // A restored window comes back where and as large as it was.
            if let Some(bounds) = browser.requested_bounds() {
                self.page.restore_frame(bounds);
            }
        } else {
            let _ = browser.set_backgrounded(true);
        }
        self.browsers.borrow_mut().insert(id, (profile, browser));
    }

    /// Whether the window goes full screen for a page of the Browser in front
    /// (`full_screen`), or comes back once the page is done with it; the
    /// change is the caller's to make. Full screen the user chose stays as
    /// the page leaves it.
    pub fn wants_full_screen_for_page(&self, full_screen: bool) -> bool {
        if !full_screen {
            return self.full_screen_for_page.replace(false);
        }
        if !self.page.is_full_screen() {
            self.full_screen_for_page.set(true);
        }
        true
    }

    /// Tells the Browsers the window has gone full screen or come back, once
    /// it has. Coming back takes their pages out of it too.
    pub fn full_screen_finished(&self, full_screen: bool) {
        if !full_screen {
            self.full_screen_for_page.set(false);
        }
        for (_, browser) in self.browsers.borrow().values() {
            let _ = browser.set_fullscreen(full_screen);
        }
    }

    /// Names the page's marks as `browser`'s anchors. An extension's mark is
    /// named whether or not its button is shown: the page has the mark only
    /// while the button is pinned or popped out for a popup or dialog, which
    /// opens below it, and below the extensions anchor, page info's, while
    /// it has not. Wren pops the button out only for an action with no
    /// anchor of its own, so an unpinned one must not be named as another
    /// element. The page's marks are named once per extension.
    pub fn name_anchors(&self, browser: &Browser) {
        for (anchor, mark) in marks(browser) {
            let named = browser.set_anchor_element(&anchor, &self.page.web_view, Some(&mark));
            if let Err(error) = named {
                eprintln!("Wren named no anchor {}: {error:?}", anchor.name());
            }
        }
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

    /// Whether the window has a Browser of `profile`.
    pub fn has_profile(&self, profile: &Profile) -> bool {
        self.browsers.borrow().contains_key(&profile.id())
    }

    pub fn is_empty(&self) -> bool {
        self.browsers.borrow().is_empty()
    }
}

/// `browser`'s anchors, each with the name of the page's mark it is.
pub fn marks(browser: &Browser) -> Vec<(BubbleAnchor, String)> {
    let mut marks = vec![
        (BubbleAnchor::LOCATION, PAGE_INFO.to_owned()),
        (BubbleAnchor::EXTENSIONS, PAGE_INFO.to_owned()),
    ];
    marks.extend(browser.extension_action_ids().into_iter().map(|id| {
        (
            BubbleAnchor::extension_action(&id),
            format!("extension:{id}"),
        )
    }));
    marks
}
