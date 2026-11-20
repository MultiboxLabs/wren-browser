// What a window's page has been told, which its window keeps
// (`BrowserWindow::told`), so the same is not sent again.
//
// Of its tabs, beyond what Chromium keeps: each tab's title, address and
// favicon ID (pages/icons.rs), and the order of each Browser's tabs it was
// last sent whole. The tabs' messages (tabs.rs) read it, so a list sent
// again reads from Chromium only what a change said is new, and a switch of
// tabs that leaves the order as it was says only which tab is active. The
// window keeps it for every tab of its Browsers, and forgets a tab once it
// is in none of them, and a Browser once it isn't the window's.
//
// Of its downloads (downloads.rs): the shelf's list and the history, as
// each was last sent.

use std::cell::RefCell;
use std::collections::{HashMap, HashSet};

use wren::{Browser, BrowserTab, TabFields};

use crate::downloads;
use crate::pages::icons;

/// What a window's page has been told.
#[derive(Default)]
pub struct Told {
    /// Of its tabs.
    pub tabs: PageTabs,
    // The downloads it was told of last, the shelf's and the history; None
    // until it has been told any.
    downloads: RefCell<Option<Vec<downloads::Item>>>,
    history: RefCell<Option<Vec<downloads::Item>>>,
}

impl Told {
    /// Notes `list` as the downloads the page is told of. None if it was
    /// told the same last, and need not be again; else the IDs of those that
    /// have started since it was told last, none the first time.
    pub fn note_downloads(&self, list: &[downloads::Item]) -> Option<Vec<String>> {
        let mut sent = self.downloads.borrow_mut();
        if sent.as_deref() == Some(list) {
            return None;
        }
        let started = sent
            .as_deref()
            .map_or_else(Vec::new, |before| downloads::started(before, list));
        *sent = Some(list.to_vec());
        Some(started)
    }

    /// Notes `history` as the download history the page is told of. False
    /// if it was told the same last, and need not be again.
    pub fn note_history(&self, history: &[downloads::Item]) -> bool {
        let mut sent = self.history.borrow_mut();
        if sent.as_deref() == Some(history) {
            return false;
        }
        *sent = Some(history.to_vec());
        true
    }
}

/// What a window's page has been told of its tabs.
#[derive(Default)]
pub struct PageTabs {
    // By tab ID.
    tabs: RefCell<HashMap<i32, Kept>>,
    // Each Browser's tab IDs, in order, by the Browser's ID.
    orders: RefCell<HashMap<i32, Vec<i32>>>,
}

/// What is kept of a tab: each field once it has been read, until a change
/// to it.
#[derive(Default)]
struct Kept {
    title: Option<String>,
    url: Option<String>,
    // The icon ID, or none for a tab with no favicon.
    favicon: Option<Option<String>>,
}

impl PageTabs {
    /// `tab`'s title: read from Chromium the first time, and again after
    /// `changed` says it changed.
    pub fn title(&self, tab: BrowserTab) -> String {
        self.read(tab, |kept| &mut kept.title, || tab.title())
    }

    /// `tab`'s address, read as its title is.
    pub fn url(&self, tab: BrowserTab) -> String {
        self.read(tab, |kept| &mut kept.url, || tab.url())
    }

    /// `tab`'s favicon's icon ID, or none, read as its title is.
    pub fn favicon(&self, tab: BrowserTab) -> Option<String> {
        self.read(
            tab,
            |kept| &mut kept.favicon,
            || tab.favicon_png().map(icons::id),
        )
    }

    // A field of `tab`, kept, or read with `read` and kept.
    fn read<T: Clone>(
        &self,
        tab: BrowserTab,
        field: impl FnOnce(&mut Kept) -> &mut Option<T>,
        read: impl FnOnce() -> T,
    ) -> T {
        let mut tabs = self.tabs.borrow_mut();
        field(tabs.entry(tab.id()).or_default())
            .get_or_insert_with(read)
            .clone()
    }

    /// Chromium says `fields` of `tab` changed: the ones kept are read again
    /// when next asked for.
    pub fn changed(&self, tab: BrowserTab, fields: TabFields) {
        let mut tabs = self.tabs.borrow_mut();
        let Some(kept) = tabs.get_mut(&tab.id()) else {
            return;
        };
        if fields.contains(TabFields::TITLE) {
            kept.title = None;
        }
        if fields.contains(TabFields::URL) {
            kept.url = None;
        }
        if fields.contains(TabFields::FAVICON) {
            kept.favicon = None;
        }
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

    /// Whether `browser` now holds a tab it did not when its list was last
    /// sent.
    pub fn has_new_tab(&self, browser: &Browser) -> bool {
        let orders = self.orders.borrow();
        let Some(kept) = orders.get(&browser.id()) else {
            return true;
        };
        browser
            .tabs()
            .into_iter()
            .any(|tab| !kept.contains(&tab.id()))
    }

    /// Forgets the tabs in none of `browsers`, the window's, and the
    /// Browsers that aren't among them.
    pub fn forget_closed(&self, browsers: &[Browser]) {
        let open: HashSet<i32> = browsers
            .iter()
            .flat_map(Browser::tabs)
            .map(BrowserTab::id)
            .collect();
        self.tabs.borrow_mut().retain(|id, _| open.contains(id));
        let kept: HashSet<i32> = browsers.iter().map(Browser::id).collect();
        self.orders.borrow_mut().retain(|id, _| kept.contains(id));
    }
}
