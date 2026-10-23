// The hidden New Tab page a Browser has while it has no tabs. Chromium
// closes a Browser with its last tab, but a space keeps its Browser: where a
// Browser would have none, a New Tab page stands in. The page neither lists
// nor shows it. It closes once a tab opens beside it, and is a tab like any
// other once it leaves the New Tab page. Chromium keeps it in the session as
// any tab, and which tab it is is only known while the app runs: a restored
// Browser with nothing but New Tab pages takes one of them as its own again
// (`adopt`).

use std::cell::RefCell;
use std::collections::HashMap;

use wren::{Browser, BrowserTab, Error, Profile};

use super::is_new_tab;

thread_local! {
    // Each placeholder, with the tabs it stands in for, which are closing as
    // it opens. A tab's ID is the app's own, whichever Browser it is in.
    static HELD: RefCell<HashMap<BrowserTab, Vec<BrowserTab>>> = RefCell::default();
}

/// Whether `tab` stands in for its Browser's tabs.
pub fn is_placeholder(tab: BrowserTab) -> bool {
    HELD.with(|held| held.borrow().contains_key(&tab))
}

/// Whether the Browser has a tab of its own: one that is not a placeholder.
pub fn has_tabs(browser: &Browser) -> bool {
    browser.tabs().into_iter().any(|tab| !is_placeholder(tab))
}

/// Before `closing` close: if they are all the Browser has, a placeholder
/// opens to stand in for them, so the Browser stays.
pub fn stand_in(browser: &Browser, closing: &[BrowserTab]) -> Result<(), Error> {
    if browser.tabs().iter().all(|tab| closing.contains(tab)) {
        hold(browser.add_tab("", None, true)?, closing);
    }
    Ok(())
}

/// Makes a Browser of `profile` with no tab of its own: Chromium's first
/// one, on the New Tab page, is its placeholder.
pub fn create_browser(profile: &Profile, done: impl FnOnce(Result<Browser, Error>) + 'static) {
    profile.create_browser("", move |result| {
        if let Ok(browser) = &result {
            for tab in browser.tabs() {
                hold(tab, &[]);
            }
        }
        done(result);
    });
}

/// A Browser Chromium opened (a restored one) that has nothing but New Tab
/// pages has no tab of its own: its active one is its placeholder, and the
/// rest close.
pub fn adopt(browser: &Browser) {
    let tabs = browser.tabs();
    if tabs.is_empty() || !tabs.iter().all(|tab| is_new_tab(&tab.url())) {
        return;
    }
    let kept = browser.active_tab().unwrap_or(tabs[0]);
    hold(kept, &[]);
    for tab in tabs.into_iter().filter(|tab| *tab != kept) {
        let _ = tab.close();
    }
}

/// Keeps the Browser's placeholder as its tabs change: it closes once a tab
/// opens beside it (not one it stands in for, which close as it opens), and
/// is a tab like any other once it leaves the New Tab page. It stays hidden
/// as it closes; one that has closed is forgotten.
pub fn settle(browser: &Browser) {
    let tabs = browser.tabs();
    let held: Vec<(BrowserTab, Vec<BrowserTab>)> = HELD.with(|held| {
        let mut held = held.borrow_mut();
        held.retain(|tab, _| tab.browser().is_some());
        held.iter()
            .filter(|(tab, _)| tabs.contains(tab))
            .map(|(tab, closing)| (*tab, closing.clone()))
            .collect()
    });
    for (tab, closing) in held {
        if !is_new_tab(&tab.url()) {
            HELD.with(|held| held.borrow_mut().remove(&tab));
        } else if tabs
            .iter()
            .any(|other| *other != tab && !closing.contains(other))
        {
            let _ = tab.close();
        }
    }
}

fn hold(tab: BrowserTab, closing: &[BrowserTab]) {
    HELD.with(|held| held.borrow_mut().insert(tab, closing.to_vec()));
}
