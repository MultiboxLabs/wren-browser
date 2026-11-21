// What each tab is: a tab of the sidebar's list, its Browser's placeholder
// (placeholder.rs), a pin's (pins/), a peek in front of another tab
// (peeks/), or one that is leaving, closing for a pin that has gone from its
// Browser. This table is the one place that says
// so, and a tab it does not hold is a tab of the list. So the list shows
// every tab but those the table names, and no tab is open and drawn nowhere
// because two places disagreed about it.
//
// A pin's tab holds a claim, its one reference to the pin: nothing else
// says which tabs are open for which pin. Chromium's own pinning follows
// the role, as a claim is made or given up: a pin's tab, a peek and a
// leaving one are pinned, which keeps them out of the list's order, and the
// rest are not. Nothing reads Chromium's pinning to tell what a tab is.

use std::cell::RefCell;
use std::collections::{HashMap, HashSet};

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
    /// A peek: opened by `behind`, and drawn in front of it, its favicon on
    /// `behind`'s row, until it closes or becomes a tab of the list
    /// (peeks/). `from` is where the pointer was over its window's page as
    /// it came, in points from the page's top left, which the page grows it
    /// out of and shrinks it back into.
    Peek {
        behind: BrowserTab,
        from: Option<(i32, i32)>,
    },
    /// Closing for a pin that has gone from its Browser, and drawn nowhere
    /// until it has closed. A close that a page refuses ends it
    /// (`let_go` in pins/mod.rs), so it never lasts.
    Leaving,
}

/// A tab's reference to the pin it is open for.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Claim {
    pub pin: PinId,
    /// Which of the pin's pages it is open for: 0, or 1 for a split pin's
    /// second.
    pub side: usize,
    /// The pin's tabs in this Browser are closing, all or none
    /// (`pins::close`). A split pin that has lost one of them then waits
    /// for the other to go, and does not keep it as the pin's.
    pub closing: bool,
}

// A tab's role, and for a pin's tab its persistent ID, read as it claims:
// a closed tab has none to read.
struct Held {
    role: Role,
    persistent: String,
}

thread_local! {
    // By tab, whose ID is the app's own whichever Browser it is in. A tab
    // of the list has no entry.
    static ROLES: RefCell<HashMap<BrowserTab, Held>> = RefCell::default();
    // The pin each closed tab was open for, by the tab's persistent ID,
    // which Reopen Closed Tab brings it back with.
    static CLOSED: RefCell<HashMap<String, PinId>> = RefCell::default();
}

/// What `tab` is.
pub fn of(tab: BrowserTab) -> Role {
    ROLES.with(|roles| {
        roles
            .borrow()
            .get(&tab)
            .map_or(Role::Listed, |held| held.role)
    })
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

/// Makes `tab` its Browser's placeholder.
pub fn hold(tab: BrowserTab) {
    set(tab, Role::Placeholder, String::new());
}

/// Makes `tab` the tab open for `side` of `pin`: Chromium pins it, and
/// keeps it out of the session, as a pin's tab never lasts. A split's two
/// claim while they are in no split, as Chromium ends a split one side of
/// which is pinned alone.
pub fn claim(tab: BrowserTab, pin: PinId, side: usize) -> Result<(), Error> {
    set_pinned(tab, true)?;
    let persistent = tab.persistent_id();
    CLOSED.with(|closed| closed.borrow_mut().remove(&persistent));
    let claim = Claim {
        pin,
        side,
        closing: false,
    };
    set(tab, Role::Pin(claim), persistent);
    Ok(())
}

/// Makes `tab` the peek in front of `behind`, come from `from` (`Role::Peek`):
/// Chromium pins it, and keeps it out of the session, as a peek never lasts.
pub fn peek(tab: BrowserTab, behind: BrowserTab, from: Option<(i32, i32)>) -> Result<(), Error> {
    set_pinned(tab, true)?;
    set(tab, Role::Peek { behind, from }, String::new());
    Ok(())
}

/// The tab `tab` is in front of, if it is a peek.
pub fn behind(tab: BrowserTab) -> Option<BrowserTab> {
    match of(tab) {
        Role::Peek { behind, .. } => Some(behind),
        _ => None,
    }
}

/// Where peek `tab` came from over its window's page (`Role::Peek`), if it
/// is a peek and the pointer was over the page.
pub fn peek_from(tab: BrowserTab) -> Option<(i32, i32)> {
    match of(tab) {
        Role::Peek { from, .. } => from,
        _ => None,
    }
}

/// The peek in front of `behind`, if it has one.
pub fn peek_of(behind: BrowserTab) -> Option<BrowserTab> {
    ROLES.with(|roles| {
        roles
            .borrow()
            .iter()
            .find_map(|(tab, held)| match held.role {
                Role::Peek { behind: of, .. } if of == behind => Some(*tab),
                _ => None,
            })
    })
}

/// The Browser's peeks, in its order, each with the tab it is in front of.
pub fn peeks(browser: &Browser) -> Vec<(BrowserTab, BrowserTab)> {
    browser
        .tabs()
        .into_iter()
        .filter_map(|tab| Some((tab, behind(tab)?)))
        .collect()
}

/// Makes `tab` a tab of the list: it has no role, and Chromium unpins it,
/// back in the session.
pub fn release(tab: BrowserTab) {
    ROLES.with(|roles| roles.borrow_mut().remove(&tab));
    if let Err(error) = set_pinned(tab, false) {
        eprintln!("Wren could not unpin a tab: {error:?}");
    }
}

/// Makes a pin's tab one that is leaving: it gives up its claim, and stays
/// pinned until it has closed. Whoever closes it releases it if it stays
/// open (`let_go` in pins/mod.rs).
pub fn leave(tab: BrowserTab) {
    set(tab, Role::Leaving, String::new());
}

/// Changes the claim of `tab` with `change`, if it is a pin's.
pub fn update_claim(tab: BrowserTab, change: impl FnOnce(&mut Claim)) {
    ROLES.with(|roles| {
        if let Some(Held {
            role: Role::Pin(claim),
            ..
        }) = roles.borrow_mut().get_mut(&tab)
        {
            change(claim);
        }
    });
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

/// The tabs open for `pin`, in every Browser, each with its claim.
pub fn claims_of(pin: PinId) -> Vec<(BrowserTab, Claim)> {
    ROLES.with(|roles| {
        let roles = roles.borrow();
        let claims = roles.iter().filter_map(|(tab, held)| match held.role {
            Role::Pin(claim) if claim.pin == pin => Some((*tab, claim)),
            _ => None,
        });
        claims.collect()
    })
}

/// The pins that have a tab open, in any Browser.
pub fn claimed_pins() -> HashSet<PinId> {
    ROLES.with(|roles| {
        let roles = roles.borrow();
        let pins = roles.values().filter_map(|held| match held.role {
            Role::Pin(claim) => Some(claim.pin),
            _ => None,
        });
        pins.collect()
    })
}

/// Forgets the tabs that have closed. A pin's is remembered by its
/// persistent ID, for when Reopen Closed Tab brings it back
/// (`closed_pin`).
pub fn forget_closed() {
    ROLES.with(|roles| {
        roles.borrow_mut().retain(|tab, held| {
            if tab.browser().is_some() {
                return true;
            }
            if let Role::Pin(claim) = held.role {
                let persistent = std::mem::take(&mut held.persistent);
                CLOSED.with(|closed| closed.borrow_mut().insert(persistent, claim.pin));
            }
            false
        });
    });
}

/// The pin the tab with persistent ID `tab` was open for when it closed,
/// if it was one's.
pub fn closed_pin(tab: &str) -> Option<PinId> {
    CLOSED.with(|closed| closed.borrow().get(tab).copied())
}

fn set(tab: BrowserTab, role: Role, persistent: String) {
    ROLES.with(|roles| roles.borrow_mut().insert(tab, Held { role, persistent }));
}

// Pins `tab` in Chromium, out of the session, or unpins it, back in it.
fn set_pinned(tab: BrowserTab, pinned: bool) -> Result<(), Error> {
    tab.set_pinned(pinned)?;
    tab.set_session_excluded(pinned)
}
