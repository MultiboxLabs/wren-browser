// What a window's page has been told of its tabs, beyond what Chromium
// keeps: each tab's favicon ID (pages/icons.rs), and the order of each
// Browser's tabs it was last sent whole. The tabs' messages (ipc/tabs.rs)
// read it, so a list sent again copies and hashes only the favicons that
// changed, and a switch of tabs that leaves the order as it was says only
// which tab is active. The window keeps it for every tab of its Browsers,
// and forgets a tab once it is in none of them, and a Browser once it isn't
// the window's.

use std::cell::RefCell;
use std::collections::{HashMap, HashSet};

use wren::{Browser, BrowserTab};

use crate::pages::icons;

#[derive(Default)]
pub struct PageTabs {
    // By tab ID; None for a tab with no favicon.
    favicons: RefCell<HashMap<i32, Option<String>>>,
    // Each Browser's tab IDs, in order, by the Browser's ID.
    orders: RefCell<HashMap<i32, Vec<i32>>>,
}

impl PageTabs {
    /// `tab`'s favicon's icon ID, or none: read from Chromium the first time,
    /// and again once `favicon_changed` says so.
    pub fn favicon(&self, tab: BrowserTab) -> Option<String> {
        self.favicons
            .borrow_mut()
            .entry(tab.id())
            .or_insert_with(|| tab.favicon_png().map(icons::id))
            .clone()
    }

    /// Chromium says `tab`'s favicon changed: the next `favicon` reads it
    /// again.
    pub fn favicon_changed(&self, tab: BrowserTab) {
        self.favicons.borrow_mut().remove(&tab.id());
    }

    /// The page was sent `browser`'s tabs whole, of `ids`, in order.
    pub fn listed(&self, browser: &Browser, ids: Vec<i32>) {
        self.orders.borrow_mut().insert(browser.id(), ids);
    }

    /// Whether the page has been sent `browser`'s tabs whole.
    pub fn has_order(&self, browser: &Browser) -> bool {
        self.orders.borrow().contains_key(&browser.id())
    }

    /// Whether `ids` are the tabs, in order, the page was last sent of
    /// `browser`.
    pub fn is_order(&self, browser: &Browser, ids: &[i32]) -> bool {
        self.orders
            .borrow()
            .get(&browser.id())
            .is_some_and(|kept| kept == ids)
    }

    /// Forgets the tabs in none of `browsers`, the window's, and the
    /// Browsers that aren't among them.
    pub fn forget_closed(&self, browsers: &[Browser]) {
        let open: HashSet<i32> = browsers
            .iter()
            .flat_map(Browser::tabs)
            .map(BrowserTab::id)
            .collect();
        self.favicons.borrow_mut().retain(|id, _| open.contains(id));
        let kept: HashSet<i32> = browsers.iter().map(Browser::id).collect();
        self.orders.borrow_mut().retain(|id, _| kept.contains(id));
    }
}
