// The browser's window: its page, and the Browsers it shows, one for each
// Profile. All are attached to the page's view; one is in front, and the
// rest wait in the background.

use std::cell::RefCell;
use std::collections::HashMap;

use wren::{Browser, BubbleAnchor, Profile};

use crate::window::PageWindow;

/// The page's mark on its page info button, which the site's bubbles (page
/// info, permission prompts), the extensions menu and unpinned extensions'
/// popups hang off. A pinned extension's button is marked
/// "extension:<id>" (address-field.tsx).
const PAGE_INFO: &str = "page-info";

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
        self.name_anchors(&browser);
        let id = profile.id();
        let mut front = self.front.borrow_mut();
        if front.is_none() {
            *front = Some(id.clone());
        } else {
            let _ = browser.set_backgrounded(true);
        }
        self.browsers.borrow_mut().insert(id, (profile, browser));
    }

    /// Names the page's marks as `browser`'s anchors. An extension's popup
    /// opens below its own button while it is pinned to the address field,
    /// and below the page info button, which lists it, while it is not; so
    /// its anchor is named again as its pin changes.
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
        let pinned = browser
            .extension_action_state(&id)
            .is_ok_and(|state| state.pinned || state.force_pinned);
        let mark = if pinned {
            format!("extension:{id}")
        } else {
            PAGE_INFO.to_owned()
        };
        (BubbleAnchor::extension_action(&id), mark)
    }));
    marks
}
