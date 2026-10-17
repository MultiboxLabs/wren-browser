// What the app does to a Browser's tabs, whether the page, the main menu or
// a context menu asks.

use wren::{Browser, BrowserTab, Error, TabGroup};

use crate::ipc::{self, OwnToast};
use crate::menus;

/// A tab on `url`, at the top of the list, as the sidebar shows new tabs.
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

/// Puts the active tab's address on the clipboard, and says so in a toast.
/// Chromium's New Tab page has none to copy (as `isNewTab` in
/// pages/ui/address.ts).
pub fn copy_url(browser: &Browser) -> Result<(), Error> {
    let Some(url) = browser.active_tab().map(|tab| tab.url()) else {
        return Ok(());
    };
    if url.is_empty() || url.starts_with("chrome://newtab") {
        return Ok(());
    }
    menus::copy(&url);
    ipc::show_toast(browser, OwnToast::UrlCopied)
}

/// The tabs of `group`, in their order.
pub fn in_group(browser: &Browser, group: TabGroup) -> Vec<BrowserTab> {
    browser
        .tabs()
        .into_iter()
        .filter(|tab| tab.state().is_ok_and(|state| state.group == Some(group)))
        .collect()
}
