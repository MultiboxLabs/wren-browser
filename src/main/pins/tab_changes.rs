// Keeping the tabs open for pins (open_tabs.rs) as Chromium changes them: a
// pin's tab closes, is unpinned, leaves its split or its page, or comes back
// with Reopen Closed Tab; a split pin's sides swap, or its layout or ratio
// changes; a pin's tab is shown.

use std::time::UNIX_EPOCH;

use wren::{Browser, BrowserTab, Error, SplitLayout, TabSplit};

use super::open_tabs::{self, Link, Side};
use super::{is_away, link_to, pin_layout, tab_with};
use crate::app::State;
use crate::db::{PinId, PinKind, PinRow};
use crate::tabs;

/// Keeps the Browser's links as its tabs change, and answers whether any
/// changed:
/// - a pin whose tabs have closed, or were unpinned, is no longer open; a
///   tab that closed is remembered, for Reopen Closed Tab;
/// - a split pin whose tabs are no longer a split becomes a tab pin of the
///   one it keeps (its first, while both are open), and the other is left an
///   ordinary tab;
/// - a pinned tab no pin links is linked again, if it was a pin's tab before
///   it closed, or else unpinned, unless it is closing for a pin
///   (`open_tabs::end_closing`);
/// - while a pin's tab is on the pin's page, the pin keeps its title and
///   favicon;
/// - a split pin keeps its split's order, layout and ratio;
/// - a pin keeps when its tabs were last active, as its last use.
pub fn follow_tab_changes(state: &State, browser: &Browser) -> bool {
    let all: Vec<(String, BrowserTab)> = browser
        .tabs()
        .into_iter()
        .map(|tab| (tab.persistent_id(), tab))
        .collect();
    let pinned: Vec<&(String, BrowserTab)> = all
        .iter()
        .filter(|(_, tab)| tabs::is_pinned(*tab))
        .collect();
    let pinned_with = |id: &str| {
        pinned
            .iter()
            .find(|(each, _)| each == id)
            .map(|(_, tab)| *tab)
    };
    open_tabs::settle_closing(browser, |id| all.iter().any(|(each, _)| each == id));
    let mut changed = false;
    let mut kept_pins = false;
    for link in open_tabs::of(browser) {
        let found: Vec<Option<BrowserTab>> = link
            .sides
            .iter()
            .map(|side| pinned_with(&side.tab))
            .collect();
        if !is_whole(&found) {
            changed = true;
            let open = |id: &str| all.iter().any(|(each, _)| each == id);
            end_broken(state, browser, &link, &found, open);
            continue;
        }
        for (index, (side, tab)) in link.sides.iter().zip(&found).enumerate() {
            if let Some(tab) = tab {
                kept_pins |= keep_look(state, browser, link.pin, index, side, *tab);
            }
        }
        // After its look, which is kept by side as the link has them.
        if keep_split(state, browser, &link, &found) {
            changed = true;
            kept_pins = true;
        }
        kept_pins |= keep_active(state, browser, &link, &found);
    }
    for (id, tab) in pinned {
        if open_tabs::pin_with(browser, id).is_none() && !open_tabs::is_closing(browser, id) {
            changed = true;
            relink(state, browser, id, *tab);
        }
    }
    if kept_pins {
        crate::ipc::broadcast_pins(state);
    }
    changed
}

/// Closes the pinned tabs of a Browser Chromium brings back (a restore,
/// Reopen Closed Window), before it is shown: a pin's tab never lasts.
// TODO: drop this once Wren can keep a tab out of the session; see the
// "Runtime request" in .agent/plans/pins.md.
pub fn drop_restored(browser: &Browser) {
    let pinned = tabs::pinned(browser);
    if !pinned.is_empty()
        && let Err(error) = tabs::close(browser, &pinned)
    {
        eprintln!("Wren could not close a restored pin's tabs: {error:?}");
    }
}

// Whether a link's tabs are all open and pinned, and a split pin's two are
// still one split.
fn is_whole(found: &[Option<BrowserTab>]) -> bool {
    let split = |tab: &Option<BrowserTab>| tab.and_then(tabs::split_of);
    match found {
        [Some(_)] => true,
        [first @ Some(_), second @ Some(_)] => {
            split(first).is_some() && split(first) == split(second)
        }
        _ => false,
    }
}

// Ends a link whose tabs are no longer whole, remembering each that closed
// (not one that is `still_open`, but unpinned) for Reopen Closed Tab. A split
// pin with a tab left keeps that one.
fn end_broken(
    state: &State,
    browser: &Browser,
    link: &Link,
    found: &[Option<BrowserTab>],
    still_open: impl Fn(&str) -> bool,
) {
    for (side, tab) in link.sides.iter().zip(found) {
        if tab.is_none() && !still_open(&side.tab) {
            open_tabs::closed(side.tab.clone(), link.pin);
        }
    }
    match found.iter().position(Option::is_some) {
        Some(kept) if found.len() == 2 => keep_side(state, browser, link, kept, found),
        _ => {
            open_tabs::remove(browser, link.pin);
        }
    }
}

// A split pin keeps the tab on `kept` alone: it becomes a tab pin of that
// page, and the other tab, if still open, is an ordinary tab.
fn keep_side(
    state: &State,
    browser: &Browser,
    link: &Link,
    kept: usize,
    found: &[Option<BrowserTab>],
) {
    if let Err(error) = state.db.split_to_tab(link.pin, kept) {
        eprintln!("Wren could not keep a split pin's tab: {error}");
        open_tabs::remove(browser, link.pin);
        return;
    }
    for (index, tab) in found.iter().enumerate() {
        if index != kept
            && let Some(tab) = tab
        {
            let _ = tab.set_pinned(false);
        }
    }
    let side = link.sides[kept].clone();
    open_tabs::update(browser, link.pin, |link| {
        link.sides = vec![side];
        link.split = None;
    });
    crate::ipc::broadcast_pins(state);
}

// While `tab` is on its pin's page, keeps the page's title and favicon as
// the tab shows them now. Whether they changed. A tab has no favicon until
// Chromium has fetched it, after its page has loaded: until then, the page
// keeps the one it had.
fn keep_look(
    state: &State,
    browser: &Browser,
    pin: PinId,
    index: usize,
    side: &Side,
    tab: BrowserTab,
) -> bool {
    if is_away(&side.page.url, &tab.url()) || tab.state().is_ok_and(|state| state.loading) {
        return false;
    }
    let title = tab.title();
    let favicon = tab.favicon_png().or_else(|| side.page.favicon.clone());
    if title.is_empty() || (title == side.page.title && favicon == side.page.favicon) {
        return false;
    }
    if let Err(error) = state
        .db
        .set_pin_look(pin, index, &title, favicon.as_deref())
    {
        eprintln!("Wren could not keep a pin's look: {error}");
        return false;
    }
    open_tabs::update(browser, pin, |link| {
        let page = &mut link.sides[index].page;
        page.title = title;
        page.favicon = favicon;
    });
    true
}

// Keeps a whole split pin's split as the pin's, as the user swaps its sides,
// changes its layout or lets go of its divider. Whether it changed. The
// pin's tabs in other Browsers are made a split alike, so each link keeps
// its sides in the pin's order.
fn keep_split(state: &State, browser: &Browser, link: &Link, found: &[Option<BrowserTab>]) -> bool {
    let (Some(kept), [Some(tab), Some(_)]) = (link.split, found) else {
        return false;
    };
    let Some(now) = tabs::split_of(*tab).and_then(|split| split.state().ok()) else {
        return false;
    };
    let swapped = now
        .first
        .is_some_and(|first| first.persistent_id() == link.sides[1].tab);
    if !swapped && (now.layout, now.ratio) == kept {
        return false;
    }
    let layout = pin_layout(now.layout);
    if let Err(error) = state.db.set_pin_split(link.pin, layout, now.ratio, swapped) {
        eprintln!("Wren could not keep a split pin's split: {error}");
        return false;
    }
    for window in state.windows.all() {
        for each in window.browsers() {
            let Some(other) = open_tabs::find(&each, link.pin).filter(|link| link.sides.len() == 2)
            else {
                continue;
            };
            open_tabs::update(&each, link.pin, |link| {
                if swapped {
                    link.sides.reverse();
                }
                link.split = Some((now.layout, now.ratio));
            });
            let split = tab_with(&each, &other.sides[0].tab).and_then(tabs::split_of);
            if each != *browser
                && let Some(split) = split
                && let Err(error) = arrange(split, swapped, now.layout, now.ratio)
            {
                eprintln!("Wren could not change a split pin's tabs: {error:?}");
            }
        }
    }
    true
}

// Swaps a split's sides if `swapped`, and gives it `layout` and `ratio`.
fn arrange(split: TabSplit, swapped: bool, layout: SplitLayout, ratio: f64) -> Result<(), Error> {
    if swapped {
        split.swap_tabs()?;
    }
    split.set_layout(layout)?;
    split.set_ratio(ratio, false)
}

// Keeps when a whole link's tabs were last active, the latest of them, as
// its pin's last use. Whether it changed.
fn keep_active(
    state: &State,
    browser: &Browser,
    link: &Link,
    found: &[Option<BrowserTab>],
) -> bool {
    let Some(at) = found
        .iter()
        .flatten()
        .filter_map(|tab| tabs::last_active(*tab).duration_since(UNIX_EPOCH).ok())
        .map(|since| since.as_secs() as i64)
        .max()
    else {
        return false;
    };
    if link.last_active == Some(at) {
        return false;
    }
    if let Err(error) = state.db.set_pin_active(link.pin, at) {
        eprintln!("Wren could not keep when a pin was last used: {error}");
        return false;
    }
    open_tabs::update(browser, link.pin, |link| link.last_active = Some(at));
    true
}

// A pinned tab no pin links: linked again to the tab pin it was open for
// before it closed, if that pin is still there and not open in the Browser;
// otherwise it is an ordinary tab.
fn relink(state: &State, browser: &Browser, id: &str, tab: BrowserTab) {
    let pin = open_tabs::closed_pin(id)
        .filter(|pin| open_tabs::find(browser, *pin).is_none())
        .and_then(|pin| state.db.pin(pin).ok().flatten());
    match pin {
        Some((
            _,
            _,
            PinRow {
                id: pin,
                kind: PinKind::Tab(page),
                ..
            },
        )) => open_tabs::add(browser, link_to(pin, [(tab, page)])),
        _ => {
            let _ = tab.set_pinned(false);
        }
    }
}
