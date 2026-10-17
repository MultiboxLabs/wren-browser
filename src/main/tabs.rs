// What the app does to a Browser's tabs, whether the page, the main menu or
// a context menu asks.

use wren::{Browser, BrowserTab, Error};

/// A tab on the New Tab page, at the top of the list, as the sidebar
/// shows new tabs.
pub fn new_tab(browser: &Browser) -> Result<(), Error> {
    browser.add_tab("", Some(0), true).map(drop)
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
