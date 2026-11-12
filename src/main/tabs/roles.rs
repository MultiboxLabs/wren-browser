// What each tab is: a tab of the sidebar's list, its Browser's placeholder
// (placeholder.rs), a pin's (pins/), or one that is leaving, closing for a
// pin that has gone from its Browser. This table is the one place that says
// so, and a tab it does not hold is a tab of the list. So the list shows
// every tab but those the table names, and no tab is open and drawn nowhere
// because two places disagreed about it.
//
// Chromium's own pinning follows the role: a pin's tab and a leaving one
// are pinned, which keeps them out of the list's order, and the rest are
// not. Nothing reads Chromium's pinning to tell what a tab is.

use std::cell::RefCell;
use std::collections::HashMap;

use wren::{Browser, BrowserTab, Error};

use crate::db::PinId;

/// What a tab is.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Role {
    /// A tab of the sidebar's list.
    Listed,
    /// Its Browser's placeholder, which the page neither lists nor shows.
    Placeholder,
    /// Open for one side of a pin, and drawn on the pin's row.
    Pin(Claim),
    /// Closing for a pin that has gone from its Browser, and drawn nowhere
    /// until it has closed. A close that a page refuses ends it
    /// (`pins::let_go`), so it never lasts.
    Leaving,
}

/// A tab's reference to the pin it is open for.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Claim {
    pub pin: PinId,
    /// Which of the pin's pages it is open for: 0, or 1 for a split pin's
    /// second.
    pub side: usize,
}

thread_local! {
    // By tab, whose ID is the app's own whichever Browser it is in. A tab
    // of the list has no entry.
    static ROLES: RefCell<HashMap<BrowserTab, Role>> = RefCell::default();
    // The pin each closed tab was open for, by the tab's persistent ID,
    // which Reopen Closed Tab brings it back with.
    static CLOSED: RefCell<HashMap<String, PinId>> = RefCell::default();
}

/// What `tab` is.
pub fn of(tab: BrowserTab) -> Role {
    ROLES.with(|roles| roles.borrow().get(&tab).copied().unwrap_or(Role::Listed))
}

/// Whether `tab` is a tab of the sidebar's list.
pub fn is_listed(tab: BrowserTab) -> bool {
    of(tab) == Role::Listed
}

/// The pin `tab` is open for, if it is a pin's.
pub fn pin_of(tab: BrowserTab) -> Option<PinId> {
    match of(tab) {
        Role::Pin(claim) => Some(claim.pin),
        _ => None,
    }
}

/// Makes `tab` what `role` says. It does not change Chromium's pinning,
/// which `set_pinned` does: a split's two are pinned and unpinned together,
/// out of their split (`split_pinned` in pins/mod.rs).
pub fn set(tab: BrowserTab, role: Role) {
    ROLES.with(|roles| {
        let mut roles = roles.borrow_mut();
        match role {
            Role::Listed => roles.remove(&tab),
            _ => roles.insert(tab, role),
        }
    });
}

/// Pins `tab` in Chromium for a pin, keeping it out of the session, as a
/// pin's tab never lasts; or unpins it, back in the session, as a tab of
/// the list.
pub fn set_pinned(tab: BrowserTab, pinned: bool) -> Result<(), Error> {
    tab.set_pinned(pinned)?;
    tab.set_session_excluded(pinned)
}

/// Makes `tab` a tab of the list: it has no role, and Chromium unpins it.
pub fn release(tab: BrowserTab) {
    set(tab, Role::Listed);
    if let Err(error) = set_pinned(tab, false) {
        eprintln!("Wren could not unpin a tab: {error:?}");
    }
}

/// The Browser's tabs that are pins', in its order, each with its claim.
pub fn claims(browser: &Browser) -> Vec<(BrowserTab, Claim)> {
    browser
        .tabs()
        .into_iter()
        .filter_map(|tab| match of(tab) {
            Role::Pin(claim) => Some((tab, claim)),
            _ => None,
        })
        .collect()
}

/// Forgets the tabs that have closed.
pub fn forget_closed() {
    ROLES.with(|roles| roles.borrow_mut().retain(|tab, _| tab.browser().is_some()));
}

/// Remembers that the tab with persistent ID `tab` closed while it was
/// open for `pin`, for when Reopen Closed Tab brings it back.
pub fn remember_closed(tab: String, pin: PinId) {
    CLOSED.with(|closed| closed.borrow_mut().insert(tab, pin));
}

/// The pin the tab with persistent ID `tab` was open for before it closed,
/// if it was one's.
pub fn closed_pin(tab: &str) -> Option<PinId> {
    CLOSED.with(|closed| closed.borrow().get(tab).copied())
}

/// Forgets that the tab with persistent ID `tab` closed: it is open again.
pub fn forget_closed_pin(tab: &str) {
    CLOSED.with(|closed| closed.borrow_mut().remove(tab));
}
