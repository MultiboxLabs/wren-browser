// The hidden New Tab page a Browser has while it has no tabs. Chromium
// closes a Browser with its last tab, but a window keeps its Browser: where a
// Browser would have none, a New Tab page stands in. The page neither lists
// nor shows it. It closes once a tab opens beside it, and is a tab like any
// other once it leaves the New Tab page. Chromium keeps it in the session as
// any tab; its persistent ID, in the Browser's session tag (window/tag.rs),
// says which tab it is after a restore (`adopt`).

use std::cell::RefCell;
use std::collections::HashMap;

use wren::{Browser, BrowserTab, Error, Profile};

use super::is_new_tab;
use crate::window::Tag;

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

/// A Browser Chromium opened (a restored one) takes back the placeholder
/// its tag names, if that tab came back, still on the New Tab page. A tab
/// reopened from an earlier launch has a new ID, and comes back as a tab of
/// its own.
pub fn adopt(browser: &Browser) {
    let Some(id) = Tag::of(browser).placeholder else {
        return;
    };
    let found = browser
        .tabs()
        .into_iter()
        .find(|tab| tab.persistent_id() == id && is_new_tab(&tab.url()));
    match found {
        Some(tab) => hold(tab, &[]),
        None => Tag::update(browser, |tag| tag.placeholder = None),
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
            Tag::update(browser, |tag| tag.placeholder = None);
        } else if tabs
            .iter()
            .any(|other| *other != tab && !closing.contains(other))
        {
            Tag::update(browser, |tag| tag.placeholder = None);
            let _ = tab.close();
        }
    }
}

// Makes `tab` its Browser's placeholder, standing in for `closing`.
fn hold(tab: BrowserTab, closing: &[BrowserTab]) {
    HELD.with(|held| held.borrow_mut().insert(tab, closing.to_vec()));
    if let Some(browser) = tab.browser() {
        Tag::update(&browser, |tag| tag.placeholder = Some(tab.persistent_id()));
    }
}
