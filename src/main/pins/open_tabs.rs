// Which of a Browser's tabs are open for which pin: each pin open in a
// Browser has its tab, or a split's two, linked to it by their persistent
// IDs. Links last while the app runs, and are never kept: at the next launch
// every pin is unopened. Each linked tab's role says which pin it is open
// for (tabs/roles.rs), and this file alone gives and takes that role, as it
// makes, changes and ends links. A tab's link that ended as the tab closed
// is remembered there, so Reopen Closed Tab, which brings the tab back with
// its ID, links it again (`relink` in tab_changes.rs).

use std::cell::RefCell;
use std::collections::HashMap;

use wren::{Browser, SplitLayout};

use super::tab_with;
use crate::db::{PinId, PinPage};
use crate::tabs::roles::{self, Claim, Role};

/// A pin open in a Browser.
#[derive(Clone, Debug)]
pub struct Link {
    pub pin: PinId,
    /// Its tab, or a split pin's two, in the pin's order.
    pub sides: Vec<Side>,
    /// A split pin's layout and ratio, as the pin keeps them.
    pub split: Option<(SplitLayout, f64)>,
    /// When its tabs were last active, as the pin keeps it; None until it
    /// is first kept (`keep_active` in tab_changes.rs).
    pub last_active: Option<i64>,
    /// Its tabs are closing, all or none (`close` in pins/mod.rs): a split
    /// pin that has lost one of them waits for the other to go, rather than
    /// keeping it as the pin's. Cleared if a page keeps them.
    pub closing: bool,
}

/// A tab open for one of a pin's pages.
#[derive(Clone, Debug)]
pub struct Side {
    /// The tab's persistent ID.
    pub tab: String,
    /// The pin's page as it keeps it: the tab is away once it leaves its
    /// address, and only a change of its title or favicon is kept again.
    pub page: PinPage,
}

impl Link {
    /// The link, of a split pin whose split is as `layout` and `ratio` say.
    pub fn with_split(self, layout: SplitLayout, ratio: f64) -> Link {
        Link {
            split: Some((layout, ratio)),
            ..self
        }
    }
}

thread_local! {
    static LINKS: RefCell<HashMap<Browser, Vec<Link>>> = RefCell::default();
}

/// The Browser's links.
pub fn of(browser: &Browser) -> Vec<Link> {
    LINKS.with(|links| links.borrow().get(browser).cloned().unwrap_or_default())
}

/// The pin's link in the Browser, if it is open there.
pub fn find(browser: &Browser, pin: PinId) -> Option<Link> {
    of(browser).into_iter().find(|link| link.pin == pin)
}

/// Links a pin's tabs in the Browser, in place of any link it had there.
pub fn add(browser: &Browser, link: Link) {
    for side in &link.sides {
        roles::forget_closed_pin(&side.tab);
    }
    let before = find(browser, link.pin);
    LINKS.with(|links| {
        let mut links = links.borrow_mut();
        let list = links.entry(browser.clone()).or_default();
        list.retain(|each| each.pin != link.pin);
        list.push(link.clone());
    });
    give_roles(browser, before.as_ref(), Some(&link));
}

/// Ends a pin's link in the Browser, and answers it. Its tabs that are
/// still open are tabs of the list by their role, and the caller unpins or
/// closes them.
pub fn remove(browser: &Browser, pin: PinId) -> Option<Link> {
    let link = LINKS.with(|links| {
        let mut links = links.borrow_mut();
        let list = links.get_mut(browser)?;
        let at = list.iter().position(|link| link.pin == pin)?;
        Some(list.remove(at))
    })?;
    give_roles(browser, Some(&link), None);
    Some(link)
}

/// Changes a pin's link in the Browser with `change`.
pub fn update(browser: &Browser, pin: PinId, change: impl FnOnce(&mut Link)) {
    let Some(before) = find(browser, pin) else {
        return;
    };
    let mut after = before.clone();
    change(&mut after);
    LINKS.with(|links| {
        let mut links = links.borrow_mut();
        if let Some(link) = links
            .get_mut(browser)
            .and_then(|list| list.iter_mut().find(|link| link.pin == pin))
        {
            *link = after.clone();
        }
    });
    give_roles(browser, Some(&before), Some(&after));
}

// Gives the Browser's tabs the roles a link's change means: those of the
// link as it was `before` are tabs of the list again, then those of the
// link as it is `after` are its pin's, each for its side.
fn give_roles(browser: &Browser, before: Option<&Link>, after: Option<&Link>) {
    for side in before.iter().flat_map(|link| &link.sides) {
        if let Some(tab) = tab_with(browser, &side.tab) {
            roles::set(tab, Role::Listed);
        }
    }
    let Some(link) = after else { return };
    for (side, kept) in link.sides.iter().enumerate() {
        if let Some(tab) = tab_with(browser, &kept.tab) {
            let claim = Claim {
                pin: link.pin,
                side,
            };
            roles::set(tab, Role::Pin(claim));
        }
    }
}

/// Forgets a Browser's links, as it closes.
pub fn forget(browser: &Browser) {
    LINKS.with(|links| links.borrow_mut().remove(browser));
}
