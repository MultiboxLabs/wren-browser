// Closing the tabs the user closes, each as its kind of tab closes, and
// counting them. A tab asked to close may stay, as its page's "Leave site?"
// prompt lets the user keep it, and Chromium does not say when it does. So a
// close is counted only once the tab has gone.

use std::cell::RefCell;
use std::collections::HashMap;

use wren::{Browser, BrowserTab, Error};

use crate::analytics::{Analytics, Event, TabFrom};
use crate::app::State;
use crate::peeks;
use crate::pins;
use crate::windows::BrowserWindow;

thread_local! {
    // The tabs asked to close, and where from. One the user kept stays here,
    // and counts as it closes, unless it goes with its Browser.
    static ASKED: RefCell<HashMap<BrowserTab, TabFrom>> = RefCell::default();
}

/// Closes `tab` of `window`'s `browser` as the user asked from `from`, as
/// Close Tab does. A peek goes back into where it came from, as its Close
/// button takes it. A pin's tab closes with the rest of the pin's, if it is
/// a split's, and leaves the pin unopened. Any other tab closes alone.
pub fn close_as_asked(
    state: &State,
    window: &BrowserWindow,
    browser: &Browser,
    tab: BrowserTab,
    from: TabFrom,
) -> Result<(), String> {
    if super::roles::behind(tab).is_some() {
        peeks::close_animated(window, tab);
        return Ok(());
    }
    close_then(state, browser, tab, from, || {})
}

/// Closes `tab` of `browser`, any tab but a peek, as `close_as_asked` does,
/// and calls `gone` once it has gone. A page that keeps its tab, as a
/// "Leave site?" can, keeps `gone` from being called.
pub fn close_then(
    state: &State,
    browser: &Browser,
    tab: BrowserTab,
    from: TabFrom,
    gone: impl FnOnce() + 'static,
) -> Result<(), String> {
    match super::roles::pin_of(tab) {
        Some(pin) => pins::close_then(state, browser, pin, gone),
        None => close_together_then(browser, &[tab], from, gone).map_err(super::failed),
    }
}

/// Closes `tab` as the user asked from `from` (`tabs::close`).
pub fn close(browser: &Browser, tab: BrowserTab, from: TabFrom) -> Result<(), Error> {
    super::close(browser, &[tab])?;
    ASKED.with(|asked| asked.borrow_mut().insert(tab, from));
    Ok(())
}

/// Closes `tabs` together as the user asked from `from`, and the peek in
/// front of each, all or none: if one's page keeps its tab, they all stay,
/// as a split's two do. Only `tabs` count as closed by the user.
pub fn close_together(browser: &Browser, tabs: &[BrowserTab], from: TabFrom) -> Result<(), Error> {
    close_together_then(browser, tabs, from, || {})
}

/// Closes `tabs` together as `close_together` does, and calls `gone` once
/// they have all gone. A page that keeps its tab keeps `gone` from being
/// called.
pub fn close_together_then(
    browser: &Browser,
    tabs: &[BrowserTab],
    from: TabFrom,
    gone: impl FnOnce() + 'static,
) -> Result<(), Error> {
    let closing = super::with_peeks(tabs);
    super::placeholder::stand_in(browser, &closing)?;
    ASKED.with(|asked| {
        let mut asked = asked.borrow_mut();
        for tab in tabs {
            asked.insert(*tab, from);
        }
    });
    BrowserTab::close_all(&closing, move |result| match result {
        Ok(()) => gone(),
        Err(Error::Cancelled) => {}
        Err(error) => eprintln!("Wren could not close tabs: {error:?}"),
    });
    Ok(())
}

/// Counts the tabs asked to close that have gone.
pub fn settle(analytics: &Analytics) {
    for from in take_gone() {
        analytics.record(Event::TabClosed { from });
    }
}

/// A Browser closed: the tabs that went with it are not counted, as no one
/// asked for each of them to close.
pub fn forget_gone() {
    take_gone();
}

// Takes the tabs asked to close that have gone, and answers where from.
fn take_gone() -> Vec<TabFrom> {
    ASKED.with(|asked| {
        let mut gone = Vec::new();
        asked.borrow_mut().retain(|tab, from| {
            let open = tab.browser().is_some();
            if !open {
                gone.push(*from);
            }
            open
        });
        gone
    })
}
