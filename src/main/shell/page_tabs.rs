// What a window's page has been told of its tabs, beyond what Chromium
// keeps: each tab's favicon ID (pages/icons.rs). The tabs' messages
// (ipc/tabs.rs) read it, so a list sent again copies and hashes only the
// favicons that changed. The window keeps it for every tab of its Browsers,
// and forgets a tab once it is in none of them.

use std::cell::RefCell;
use std::collections::{HashMap, HashSet};

use wren::{Browser, BrowserTab};

use crate::pages::icons;

#[derive(Default)]
pub struct PageTabs {
    // By tab ID; None for a tab with no favicon.
    favicons: RefCell<HashMap<i32, Option<String>>>,
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

    /// Forgets the tabs in none of `browsers`, the window's.
    pub fn forget_closed(&self, browsers: &[Browser]) {
        let open: HashSet<i32> = browsers
            .iter()
            .flat_map(Browser::tabs)
            .map(BrowserTab::id)
            .collect();
        self.favicons.borrow_mut().retain(|id, _| open.contains(id));
    }
}
