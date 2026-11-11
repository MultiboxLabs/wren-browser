// Which of a Browser's tabs are open for which pin: each pin open in a
// Browser has its tab, or a split's two, linked to it by their persistent
// IDs. Links last while the app runs, and are never kept: at the next launch
// every pin is unopened. A tab's link that ended as the tab closed is
// remembered, so Reopen Closed Tab, which brings the tab back with its ID,
// links it again (`relink` in tab_changes.rs). A pin that is going from the
// Browser has its link ended before its tabs have closed, and keeps them as
// closing until they have gone (`end_closing`).

use std::cell::RefCell;
use std::collections::{HashMap, HashSet};

use wren::{Browser, BrowserTab, SplitLayout};

use crate::db::{PinId, PinPage};

/// A pin open in a Browser.
#[derive(Clone, Debug)]
pub struct Link {
    pub pin: PinId,
    /// Its tab, or a split pin's two, in the pin's order.
    pub sides: Vec<Side>,
    /// A split pin's layout and ratio, as the pin keeps them.
    pub split: Option<(SplitLayout, f64)>,
    /// When its tabs were last active, as the pin keeps it; None until it
    /// is first kept (`keep_active` in tab_changes.rs).
    pub last_active: Option<i64>,
    /// Its tabs are closing, all or none (`close` in pins/mod.rs): a split
    /// pin that has lost one of them waits for the other to go, rather than
    /// keeping it as the pin's. Cleared if a page keeps them.
    pub closing: bool,
}

/// A tab open for one of a pin's pages.
#[derive(Clone, Debug)]
pub struct Side {
    /// The tab's persistent ID.
    pub tab: String,
    /// The pin's page as it keeps it: the tab is away once it leaves its
    /// address, and only a change of its title or favicon is kept again.
    pub page: PinPage,
}

impl Link {
    /// The link, of a split pin whose split is as `layout` and `ratio` say.
    pub fn with_split(self, layout: SplitLayout, ratio: f64) -> Link {
        Link {
            split: Some((layout, ratio)),
            ..self
        }
    }
}

thread_local! {
    static LINKS: RefCell<HashMap<Browser, Vec<Link>>> = RefCell::default();
    // A closed tab's persistent ID, and the pin it was open for.
    static CLOSED: RefCell<HashMap<String, PinId>> = RefCell::default();
    // The persistent IDs of the tabs each Browser is closing for links ended.
    static CLOSING: RefCell<HashMap<Browser, HashSet<String>>> = RefCell::default();
}

/// The Browser's links.
pub fn of(browser: &Browser) -> Vec<Link> {
    LINKS.with(|links| links.borrow().get(browser).cloned().unwrap_or_default())
}

/// The pin's link in the Browser, if it is open there.
pub fn find(browser: &Browser, pin: PinId) -> Option<Link> {
    of(browser).into_iter().find(|link| link.pin == pin)
}

/// The pin `tab` is open for, if it is a pin's.
pub fn pin_of(browser: &Browser, tab: BrowserTab) -> Option<PinId> {
    pin_with(browser, &tab.persistent_id())
}

/// The pin the tab with persistent ID `tab` is open for, if it is a pin's.
pub fn pin_with(browser: &Browser, tab: &str) -> Option<PinId> {
    of(browser)
        .into_iter()
        .find(|link| link.sides.iter().any(|side| side.tab == tab))
        .map(|link| link.pin)
}

/// Links a pin's tabs in the Browser, in place of any link it had there.
pub fn add(browser: &Browser, link: Link) {
    for side in &link.sides {
        CLOSED.with(|closed| closed.borrow_mut().remove(&side.tab));
    }
    LINKS.with(|links| {
        let mut links = links.borrow_mut();
        let list = links.entry(browser.clone()).or_default();
        list.retain(|each| each.pin != link.pin);
        list.push(link);
    });
}

/// Ends a pin's link in the Browser, and answers it.
pub fn remove(browser: &Browser, pin: PinId) -> Option<Link> {
    LINKS.with(|links| {
        let mut links = links.borrow_mut();
        let list = links.get_mut(browser)?;
        let at = list.iter().position(|link| link.pin == pin)?;
        Some(list.remove(at))
    })
}

/// Ends a pin's link in the Browser to close its tabs, and answers it. Its
/// tabs are closing until they have gone: Chromium closes each on its own,
/// and the other of a split's is not left a pinned tab no pin links, which
/// would be unpinned into the list as it closes (`relink` in tab_changes.rs).
pub fn end_closing(browser: &Browser, pin: PinId) -> Option<Link> {
    let link = remove(browser, pin)?;
    CLOSING.with(|closing| {
        let mut closing = closing.borrow_mut();
        let tabs = closing.entry(browser.clone()).or_default();
        tabs.extend(link.sides.iter().map(|side| side.tab.clone()));
    });
    Some(link)
}

/// Whether the tab with persistent ID `tab` is closing for a link ended
/// (`end_closing`).
pub fn is_closing(browser: &Browser, tab: &str) -> bool {
    CLOSING.with(|closing| {
        closing
            .borrow()
            .get(browser)
            .is_some_and(|tabs| tabs.contains(tab))
    })
}

/// Forgets the closing tabs that have gone: those `open` says are not.
pub fn settle_closing(browser: &Browser, open: impl Fn(&str) -> bool) {
    CLOSING.with(|closing| {
        let mut closing = closing.borrow_mut();
        if let Some(tabs) = closing.get_mut(browser) {
            tabs.retain(|tab| open(tab));
            if tabs.is_empty() {
                closing.remove(browser);
            }
        }
    });
}

/// Changes a pin's link in the Browser with `change`.
pub fn update(browser: &Browser, pin: PinId, change: impl FnOnce(&mut Link)) {
    LINKS.with(|links| {
        let mut links = links.borrow_mut();
        if let Some(link) = links
            .get_mut(browser)
            .and_then(|list| list.iter_mut().find(|link| link.pin == pin))
        {
            change(link);
        }
    });
}

/// Remembers that a pin's tab closed, for `relink`.
pub fn closed(tab: String, pin: PinId) {
    CLOSED.with(|closed| closed.borrow_mut().insert(tab, pin));
}

/// The pin a tab was open for before it closed, if it was one's.
pub fn closed_pin(tab: &str) -> Option<PinId> {
    CLOSED.with(|closed| closed.borrow().get(tab).copied())
}

/// Forgets a Browser's links, and the tabs it was closing, as it closes.
pub fn forget(browser: &Browser) {
    LINKS.with(|links| links.borrow_mut().remove(browser));
    CLOSING.with(|closing| closing.borrow_mut().remove(browser));
}
