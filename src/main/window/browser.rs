// A browser window: its page, and the Browsers it shows, at most one for each
// place it has been on (place.rs): each space, or the one profile it shows.
// All are attached to the page's view; the current place's is in front, and
// the rest wait in the background. A place can be without one: its last tab
// closed, or the window has not opened a tab in it. Each Browser carries the
// window's key and its place in its session tag, so a restore puts it back
// (tag.rs).

use std::cell::{Cell, RefCell};
use std::collections::HashMap;

use wren::{Browser, BubbleAnchor};

use super::tag::Tag;
use super::{PageWindow, Place};
use crate::db::SpaceId;
use crate::tabs::placeholder;

/// The page's mark on its page info button, which the site's bubbles (page
/// info, permission prompts), the extensions menu and unpinned extensions'
/// popups hang off. A pinned extension's button is marked
/// "extension:<id>" (address-field.tsx).
const PAGE_INFO: &str = "page-info";

/// Tells a window from the others for as long as the app runs.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub struct WindowId(pub u64);

/// What a window has for a place: its Browser, or one on the way.
enum Slot {
    Opening,
    Open(Browser),
}

pub struct BrowserWindow {
    pub id: WindowId,
    /// Its row in the database, which lasts across launches as its ID does
    /// not.
    pub key: String,
    pub page: PageWindow,
    places: RefCell<HashMap<Place, Slot>>,
    // The place in front; none only for the window the app opens at startup,
    // until its first Browser. A window on a profile has only that place.
    current: RefCell<Option<Place>>,
    // Whether a Browser has come to the window, and given it its frame.
    framed: Cell<bool>,
    // The user closed the window: it goes once its Browsers have.
    closing: Cell<bool>,
    // The page shows the omnibox for a new tab, which ⌘W closes.
    new_tab_omnibox: Cell<bool>,
    // The Browser the page's omnibox asks for suggestions, from its query
    // until it stops (ipc/omnibox.rs).
    omnibox_query: RefCell<Option<Browser>>,
    // Whether the window went full screen for a page, and comes back once
    // the page is done; not so for full screen the user chose.
    full_screen_for_page: Cell<bool>,
}

impl BrowserWindow {
    /// `framed`: the window has its frame already, from the database, and a
    /// Browser's does not move it.
    pub fn new(
        id: WindowId,
        key: String,
        page: PageWindow,
        place: Option<Place>,
        framed: bool,
    ) -> BrowserWindow {
        BrowserWindow {
            id,
            key,
            page,
            places: RefCell::default(),
            current: RefCell::new(place),
            framed: Cell::new(framed),
            closing: Cell::default(),
            new_tab_omnibox: Cell::default(),
            omnibox_query: RefCell::default(),
            full_screen_for_page: Cell::default(),
        }
    }

    /// The place in front.
    pub fn place(&self) -> Option<Place> {
        self.current.borrow().clone()
    }

    /// The space in front, if the window shows spaces.
    pub fn space(&self) -> Option<SpaceId> {
        self.current.borrow().as_ref()?.space()
    }

    /// Whether the window shows one profile, and never switches.
    pub fn is_profile_window(&self) -> bool {
        matches!(*self.current.borrow(), Some(Place::Profile { .. }))
    }

    /// The Browser in front, the current place's, whose tabs the page shows.
    pub fn browser(&self) -> Option<Browser> {
        self.browser_of(self.current.borrow().as_ref()?)
    }

    /// The Browser in front, if the current place has tabs of its own in it.
    /// A place without is empty, whichever way: it has no Browser (none made
    /// yet, one that failed to open, or one Chromium closed, as a page's
    /// `window.close()` does), or one holding only its placeholder. This is
    /// the one check for an empty place; `browser` is for what needs a
    /// Browser to ask, tabs or not.
    pub fn browser_with_tabs(&self) -> Option<Browser> {
        self.browser().filter(placeholder::has_tabs)
    }

    /// The window's Browser for `place`, if it has one open.
    pub fn browser_of(&self, place: &Place) -> Option<Browser> {
        match self.places.borrow().get(place) {
            Some(Slot::Open(browser)) => Some(browser.clone()),
            _ => None,
        }
    }

    /// The place `browser` is the window's Browser for.
    pub fn place_of(&self, browser: &Browser) -> Option<Place> {
        self.places
            .borrow()
            .iter()
            .find(|(_, slot)| matches!(slot, Slot::Open(each) if each == browser))
            .map(|(place, _)| place.clone())
    }

    /// The space `browser` is the window's Browser for, if it is a space's.
    pub fn space_of(&self, browser: &Browser) -> Option<SpaceId> {
        self.place_of(browser)?.space()
    }

    /// Whether `browser` is one of the window's.
    pub fn has_browser(&self, browser: &Browser) -> bool {
        self.place_of(browser).is_some()
    }

    /// The spaces the window has a Browser open for.
    pub fn open_spaces(&self) -> Vec<SpaceId> {
        let places = self.places.borrow();
        let mut open: Vec<SpaceId> = places
            .iter()
            .filter(|(_, slot)| matches!(slot, Slot::Open(_)))
            .filter_map(|(place, _)| place.space())
            .collect();
        open.sort_unstable();
        open
    }

    /// Whether the window has a Browser open, for any place.
    pub fn has_browsers(&self) -> bool {
        self.places
            .borrow()
            .values()
            .any(|slot| matches!(slot, Slot::Open(_)))
    }

    /// Closes the window's Browsers. The window goes as the last of them
    /// closes (`App::browser_closed`).
    pub fn close_browsers(&self) {
        self.closing.set(true);
        let browsers: Vec<Browser> = self
            .places
            .borrow()
            .values()
            .filter_map(|slot| match slot {
                Slot::Open(browser) => Some(browser.clone()),
                Slot::Opening => None,
            })
            .collect();
        for browser in browsers {
            let _ = browser.close();
        }
    }

    /// Whether the user closed the window, which waits for its Browsers.
    pub fn is_closing(&self) -> bool {
        self.closing.get()
    }

    /// A Browser in the background that Chromium has asked to come forward.
    pub fn wanting_foreground(&self) -> Option<Browser> {
        let front = self.browser();
        self.places.borrow().values().find_map(|slot| match slot {
            Slot::Open(browser)
                if Some(browser) != front.as_ref() && browser.wants_foreground() =>
            {
                Some(browser.clone())
            }
            _ => None,
        })
    }

    /// Notes whether the page shows the omnibox for a new tab.
    pub fn set_new_tab_omnibox(&self, shown: bool) {
        self.new_tab_omnibox.set(shown);
    }

    /// Whether the page shows the omnibox for a new tab.
    pub fn has_new_tab_omnibox(&self) -> bool {
        self.new_tab_omnibox.get()
    }

    /// Notes the Browser the page's omnibox asks.
    pub fn set_omnibox_query(&self, browser: Browser) {
        *self.omnibox_query.borrow_mut() = Some(browser);
    }

    /// Notes that the page's omnibox asks none, and answers the one it did.
    pub fn take_omnibox_query(&self) -> Option<Browser> {
        self.omnibox_query.borrow_mut().take()
    }

    /// Whether the page's omnibox asks `browser` for suggestions.
    pub fn asks_omnibox(&self, browser: &Browser) -> bool {
        self.omnibox_query.borrow().as_ref() == Some(browser)
    }

    /// Whether `browser` is the one in front.
    pub fn is_front(&self, browser: &Browser) -> bool {
        self.browser().as_ref() == Some(browser)
    }

    /// Notes that a Browser for `place` is on the way; false if the window
    /// has one already, or one on the way, so none is made twice.
    pub fn set_opening(&self, place: &Place) -> bool {
        let mut places = self.places.borrow_mut();
        if places.contains_key(place) {
            return false;
        }
        places.insert(place.clone(), Slot::Opening);
        true
    }

    /// Shows `browser` as the window's for `place`: in front if that is the
    /// current place, or the window has none yet, otherwise in the
    /// background.
    pub fn add(&self, place: Place, browser: Browser) {
        Tag::update(&browser, |tag| {
            tag.window = Some((self.key.clone(), place.clone()));
        });
        browser.attach_to_view(Some(self.page.web_view.view()));
        self.name_anchors(&browser);
        // Its pages take a window that is full screen already without asking.
        if self.page.is_full_screen() {
            let _ = browser.set_fullscreen(true);
        }
        let mut current = self.current.borrow_mut();
        if current.is_none() {
            *current = Some(place.clone());
        }
        if current.as_ref() != Some(&place) {
            let _ = browser.set_backgrounded(true);
        }
        drop(current);
        // A restored window comes back where and as large as it was.
        if !self.framed.replace(true)
            && let Some(bounds) = browser.requested_bounds()
        {
            self.page.restore_frame(bounds);
        }
        self.places.borrow_mut().insert(place, Slot::Open(browser));
    }

    /// Brings `space` forward: the Browser in front goes to the background
    /// first, so two are never in front, then the space's comes forward if
    /// the window has one. Answers the Browser in front now. A window on a
    /// profile never switches (`show_space` refuses it first).
    pub fn switch_to(&self, space: SpaceId) -> Option<Browser> {
        if self.is_profile_window() {
            return self.browser();
        }
        if let Some(old) = self.browser() {
            let _ = old.set_backgrounded(true);
        }
        *self.current.borrow_mut() = Some(Place::Space(space));
        let new = self.browser()?;
        let _ = new.set_backgrounded(false);
        Some(new)
    }

    /// Forgets a Browser that has closed, and answers the place it was for.
    /// The current place stays the current place, without one.
    pub fn remove(&self, browser: &Browser) -> Option<Place> {
        if self.asks_omnibox(browser) {
            self.take_omnibox_query();
        }
        let place = self.place_of(browser)?;
        self.places.borrow_mut().remove(&place);
        Some(place)
    }

    /// Forgets the window's Browser for `place`, or the one on the way, and
    /// answers it.
    pub fn forget(&self, place: &Place) -> Option<Browser> {
        match self.places.borrow_mut().remove(place)? {
            Slot::Open(browser) => Some(browser),
            Slot::Opening => None,
        }
    }

    /// Whether a Browser for `place` is on the way, and still wanted.
    pub fn is_opening(&self, place: &Place) -> bool {
        matches!(self.places.borrow().get(place), Some(Slot::Opening))
    }

    /// The spaces the window has a Browser for, or one on the way.
    pub fn kept_spaces(&self) -> Vec<SpaceId> {
        self.places
            .borrow()
            .keys()
            .filter_map(Place::space)
            .collect()
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
        for slot in self.places.borrow().values() {
            if let Slot::Open(browser) = slot {
                let _ = browser.set_fullscreen(full_screen);
            }
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
