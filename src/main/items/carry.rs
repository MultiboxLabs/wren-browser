// The tokens a drag of the list's tabs carries to another window. A drag's
// data is open to whatever it is dropped on, a website too, and a website
// may start a drag that says anything, so the sidebar of another window
// names what it was dropped by these alone: each tab and group of the list
// has one, which the page of its own window is told with it
// (ipc/tabs.rs, ipc/groups.rs), and no website ever is. A drop on its own
// window's sidebar is named by what that page itself picked up.
//
// Once a drag ends, wherever it was dropped, its tokens are renewed: one a
// website read from a drag dropped on it moves nothing. The window a drag
// is dropped in and the one it started in tell the app in either order, so
// a renewed token still names its tab or group for a moment (`GRACE`).

use std::cell::RefCell;
use std::collections::HashMap;
use std::fmt::Write;
use std::time::Duration;

use wren::{Browser, BrowserTab, MainThread, TabGroup};

use super::{ItemRef, Listed};
use crate::app::State;
use crate::ipc::TabChanges;

/// How long a renewed token still names its tab or group, for the drop
/// that comes after its drag's end.
const GRACE: Duration = Duration::from_secs(2);

thread_local! {
    // Each tab's and group's token, made as a page is first told it.
    static TOKENS: RefCell<HashMap<Listed, String>> = RefCell::default();
    // What each token names: the tokens above, and those renewed within
    // `GRACE`.
    static NAMED: RefCell<HashMap<String, Listed>> = RefCell::default();
}

/// The token of `tab`, made if it has none; none if no token can be made,
/// and then it moves to no other window.
pub fn tab_token(tab: BrowserTab) -> Option<String> {
    token(Listed::Tab(tab))
}

/// The token of `group`, as `tab_token`.
pub fn group_token(group: TabGroup) -> Option<String> {
    token(Listed::Group(group))
}

/// The tab or group `token` names, if it is one still.
pub fn item_of(token: &str) -> Option<ItemRef> {
    named(token).map(Listed::item)
}

fn token(item: Listed) -> Option<String> {
    if let Some(token) = TOKENS.with_borrow(|tokens| tokens.get(&item).cloned()) {
        return Some(token);
    }
    let token = new_token()?;
    TOKENS.with_borrow_mut(|tokens| tokens.insert(item, token.clone()));
    NAMED.with_borrow_mut(|named| named.insert(token.clone(), item));
    Some(token)
}

fn named(token: &str) -> Option<Listed> {
    NAMED.with_borrow(|named| named.get(token).copied())
}

/// Renews the tokens of a drag that ended, and tells each window whose tabs
/// and groups they named the new ones. The old ones go after `GRACE`.
pub fn renew(state: &State, mt: MainThread, tokens: Vec<String>) {
    let mut told: Vec<(Browser, TabChanges)> = Vec::new();
    for token in &tokens {
        let Some(item) = named(token) else { continue };
        // Unless it was renewed already, and has another now.
        let current = TOKENS.with_borrow(|tokens| tokens.get(&item) == Some(token));
        let Some(browser) = item.browser().filter(|_| current) else {
            continue;
        };
        TOKENS.with_borrow_mut(|tokens| tokens.remove(&item));
        let at = match told.iter().position(|(each, _)| *each == browser) {
            Some(at) => at,
            None => {
                told.push((browser, TabChanges::default()));
                told.len() - 1
            }
        };
        match item {
            Listed::Tab(tab) => told[at].1.hear_tab(tab),
            Listed::Group(_) => told[at].1.hear_group(),
        }
    }
    mt.after(GRACE, move |_| {
        NAMED.with_borrow_mut(|named| {
            for token in &tokens {
                named.remove(token);
            }
        });
    });
    for (browser, changes) in told {
        if let Some(window) = state.windows.of(&browser) {
            changes.send(&window, &browser);
        }
    }
}

/// Forgets the tokens of tabs and groups that have gone.
pub fn forget_gone() {
    TOKENS.with_borrow_mut(|tokens| tokens.retain(|item, _| item.browser().is_some()));
    NAMED.with_borrow_mut(|named| named.retain(|_, item| item.browser().is_some()));
}

// 128 random bits, as hexadecimal.
fn new_token() -> Option<String> {
    let mut bytes = [0u8; 16];
    if let Err(error) = getrandom::fill(&mut bytes) {
        eprintln!("Wren could not make a drag's token: {error}");
        return None;
    }
    let token = bytes.iter().fold(String::with_capacity(32), |mut text, byte| {
        let _ = write!(text, "{byte:02x}");
        text
    });
    Some(token)
}
