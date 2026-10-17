// What the app does to a Browser's tabs, whether the page, the main menu or
// a context menu asks.

use wren::{Browser, BrowserTab, Error, TabGroup};

/// A tab on the New Tab page, at the top of the list, as the sidebar
/// shows new tabs.
pub fn new_tab(browser: &Browser) -> Result<(), Error> {
    open(browser, "")
}

/// A tab on `url`, at the top of the list, as a new tab is.
pub fn open(browser: &Browser, url: &str) -> Result<(), Error> {
    browser.add_tab(url, Some(0), true).map(drop)
}

/// Closes `tabs`. Chromium closes a Browser with its last tab, so the
/// window keeps one, on the New Tab page, when they are all it has.
pub fn close(browser: &Browser, tabs: &[BrowserTab]) -> Result<(), Error> {
    if browser.tabs().iter().all(|tab| tabs.contains(tab)) {
        browser.add_tab("", None, true)?;
    }
    for tab in tabs {
        tab.close()?;
    }
    Ok(())
}

/// The tabs of `group`, in their order.
pub fn in_group(browser: &Browser, group: TabGroup) -> Vec<BrowserTab> {
    browser
        .tabs()
        .into_iter()
        .filter(|tab| tab.state().is_ok_and(|state| state.group == Some(group)))
        .collect()
}
