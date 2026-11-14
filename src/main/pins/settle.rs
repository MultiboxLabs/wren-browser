// Keeping the pins' tabs right as Chromium changes them (open.rs): a pin's
// tab closes, is unpinned, leaves its split or comes to a Browser that does
// not show its pin, or comes back with Reopen Closed Tab; a split pin's
// sides swap, or its layout or ratio changes; a pin's tab is shown.

use std::time::UNIX_EPOCH;

use wren::{Browser, BrowserTab, Change, ChangeKind, Error, SplitLayout, TabFields, TabSplit};

use super::open::{self, Kept, Opening};
use super::{is_away, pin_for};
use crate::app::State;
use crate::db::{PinId, PinKind, PinRow};
use crate::shell::Place;
use crate::tabs;
use crate::tabs::roles::{self, Role};

/// Settles the Browser's pins after `change`, one of its tabs' changes,
/// and answers whether any tab's role changed with it, so that the page is
/// told its tabs again. A change of one tab that leaves its pinning and its
/// split as they were only keeps that tab's look. Any other settles them
/// all:
/// - a claim holds only for a pin that the Browser's place shows, that no
///   other Browser of its window has open, and whose tabs are all open,
///   pinned and, for a split pin, one split. The tabs of one that fails are
///   tabs of the list again, and never closed;
/// - a split pin whose tabs are no longer a split becomes a tab pin of the
///   one it keeps (its first, while both are open), and the other is a tab
///   of the list, unless the pin's tabs are closing (`Claim::closing`);
/// - a tab Chromium has pinned that is a tab of the list by its role takes
///   its claim again, if it was a pin's tab before it closed, its Browser's
///   place still shows that pin, and its window has the pin open nowhere,
///   or else is unpinned;
/// - while a pin's tab is on the pin's page, the pin keeps its title and
///   favicon;
/// - a split pin keeps its split's order, layout and ratio;
/// - a pin keeps when its tabs were last active, as its last use.
pub fn settle(state: &State, browser: &Browser, change: &Change) -> bool {
    let structure = TabFields::PINNED | TabFields::SPLIT;
    if change.kind == ChangeKind::Tab && !change.tab_fields.intersects(structure) {
        if change.tab.is_some_and(|tab| keep_look_of(state, tab)) {
            crate::ipc::broadcast_pins(state);
        }
        return false;
    }
    let pinned: Vec<BrowserTab> = browser
        .tabs()
        .into_iter()
        .filter(|tab| tab.state().is_ok_and(|state| state.pinned))
        .collect();
    let window = state.windows.of(browser);
    let place = window.and_then(|window| window.place_of(browser));
    let mut changed = false;
    let mut kept_pins = false;
    let openings = open::openings(browser);
    // A second tab that claims a side another has is no pin's.
    for (tab, claim) in roles::claims(browser) {
        let found = openings.iter().find(|each| each.pin == claim.pin);
        if !found.is_some_and(|opening| opening.sides.contains(&Some(tab))) {
            changed = true;
            roles::release(tab);
        }
    }
    for opening in openings {
        let Some(kept) = open::kept(opening.pin) else {
            continue;
        };
        if !is_shown(&kept, browser, place.as_ref())
            || is_open_elsewhere(state, browser, opening.pin)
        {
            changed = true;
            opening.tabs().into_iter().for_each(roles::release);
            continue;
        }
        let found: Vec<Option<BrowserTab>> = opening
            .sides
            .iter()
            .map(|tab| tab.filter(|tab| pinned.contains(tab)))
            .collect();
        let Some(whole) = whole(&found) else {
            changed = true;
            end_broken(state, &opening, &found);
            continue;
        };
        for (side, tab) in whole.iter().enumerate() {
            kept_pins |= keep_look(state, opening.pin, side, *tab);
        }
        // After its look, which is kept by side as the pin has them.
        if keep_split(state, browser, opening.pin, &whole) {
            changed = true;
            kept_pins = true;
        }
        kept_pins |= keep_active(state, opening.pin, &whole);
    }
    for tab in pinned {
        if roles::of(tab) == Role::Listed {
            changed = true;
            relink(state, browser, place.as_ref(), tab);
        }
    }
    open::forget_unopened();
    if kept_pins {
        crate::ipc::broadcast_pins(state);
    }
    changed
}

// Whether the Browser, a window's for `place`, shows the pin that keeps
// `kept`. A pin whose owner is not known, or a Browser no window shows, is
// let be.
fn is_shown(kept: &Kept, browser: &Browser, place: Option<&Place>) -> bool {
    match (&kept.owner, place) {
        (Some(owner), Some(place)) => owner.is_shown_in(browser, place),
        _ => true,
    }
}

// Whether another Browser of `browser`'s window has the pin open, its tabs
// not closing. A window has one opening of a pin (`open::opening_near`), so
// the one settled second is let go: nothing in the app makes two.
fn is_open_elsewhere(state: &State, browser: &Browser, pin: PinId) -> bool {
    let Some(window) = state.windows.of(browser) else {
        return false;
    };
    roles::claims_of(pin).into_iter().any(|(tab, claim)| {
        !claim.closing
            && tab
                .browser()
                .is_some_and(|other| other != *browser && window.has_browser(&other))
    })
}

// A pin's tabs, if they are all open and pinned, and a split pin's two are
// still one split.
fn whole(found: &[Option<BrowserTab>]) -> Option<Vec<BrowserTab>> {
    match found {
        [Some(tab)] => Some(vec![*tab]),
        [Some(first), Some(second)] => {
            let split = tabs::split_of(*first)?;
            (Some(split) == tabs::split_of(*second)).then(|| vec![*first, *second])
        }
        _ => None,
    }
}

// Ends an opening whose tabs are no longer whole: those `found` are still
// open and pinned. A split pin with a tab left keeps that one, unless its
// tabs are closing: then it waits for the one left to go too. Otherwise
// its tabs that are still open are tabs of the list.
fn end_broken(state: &State, opening: &Opening, found: &[Option<BrowserTab>]) {
    let left = found.iter().position(Option::is_some);
    match (left, found.len()) {
        (Some(_), _) if opening.closing => {}
        (Some(side), 2) => keep_side(state, opening, side, found),
        _ => opening.tabs().into_iter().for_each(roles::release),
    }
}

// A split pin keeps the tab on `side` alone: it becomes a tab pin of that
// page, and the other tab, if still open, is a tab of the list.
fn keep_side(state: &State, opening: &Opening, side: usize, found: &[Option<BrowserTab>]) {
    let Some(tab) = found[side] else { return };
    if let Err(error) = open::split_to_tab(state, opening.pin, side, tab) {
        eprintln!("Wren could not keep a split pin's tab: {error}");
        opening.tabs().into_iter().for_each(roles::release);
        return;
    }
    for other in opening.tabs().into_iter().filter(|other| *other != tab) {
        roles::release(other);
    }
    crate::ipc::broadcast_pins(state);
}

// Keeps the look of the pin `tab` is open for, if it is a pin's
// (`keep_look`). Whether it changed.
fn keep_look_of(state: &State, tab: BrowserTab) -> bool {
    match roles::of(tab) {
        Role::Pin(claim) => keep_look(state, claim.pin, claim.side, tab),
        _ => false,
    }
}

// While `tab` is on its pin's page, keeps the page's title and favicon as
// the tab shows them now. Whether they changed. A tab has no favicon until
// Chromium has fetched it, after its page has loaded: until then, the page
// keeps the one it had.
fn keep_look(state: &State, pin: PinId, side: usize, tab: BrowserTab) -> bool {
    let Some(page) = open::kept(pin).and_then(|kept| kept.pages.get(side).cloned()) else {
        return false;
    };
    if is_away(&page.url, &tab.url()) || tab.state().is_ok_and(|state| state.shows_loading) {
        return false;
    }
    let title = tab.title();
    let favicon = tab.favicon_png().or_else(|| page.favicon.clone());
    if title.is_empty() || (title == page.title && favicon == page.favicon) {
        return false;
    }
    if let Err(error) = open::set_look(state, pin, side, title, favicon) {
        eprintln!("Wren could not keep a pin's look: {error}");
        return false;
    }
    true
}

// Keeps a whole split pin's split as the pin's, as the user swaps its sides,
// changes its layout or lets go of its divider. Whether it changed. The
// pin's tabs in other Browsers are made a split alike, so each has its
// sides in the pin's order.
fn keep_split(state: &State, browser: &Browser, pin: PinId, whole: &[BrowserTab]) -> bool {
    let [first, second] = whole else {
        return false;
    };
    let Some(kept) = open::kept(pin).and_then(|kept| kept.split) else {
        return false;
    };
    let Some(now) = tabs::split_of(*first).and_then(|split| split.state().ok()) else {
        return false;
    };
    let swapped = now.first == Some(*second);
    if !swapped && (now.layout, now.ratio) == kept {
        return false;
    }
    if let Err(error) = open::set_split(state, pin, now.layout, now.ratio, swapped) {
        eprintln!("Wren could not keep a split pin's split: {error}");
        return false;
    }
    // Each other Browser's, once: both its tabs are in the one split.
    let mut arranged: Vec<TabSplit> = Vec::new();
    for (tab, _) in roles::claims_of(pin) {
        let elsewhere = tab.browser().is_some_and(|other| other != *browser);
        let Some(split) =
            tabs::split_of(tab).filter(|split| elsewhere && !arranged.contains(split))
        else {
            continue;
        };
        arranged.push(split);
        if let Err(error) = arrange(split, swapped, now.layout, now.ratio) {
            eprintln!("Wren could not change a split pin's tabs: {error:?}");
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

// Keeps when a whole pin's tabs were last active, the latest of them, as
// its last use. Whether it changed.
fn keep_active(state: &State, pin: PinId, whole: &[BrowserTab]) -> bool {
    let Some(at) = whole
        .iter()
        .filter_map(|tab| tabs::last_active(*tab).duration_since(UNIX_EPOCH).ok())
        .map(|since| since.as_secs() as i64)
        .max()
    else {
        return false;
    };
    if open::kept(pin).is_some_and(|kept| kept.last_active == Some(at)) {
        return false;
    }
    if let Err(error) = open::set_active(state, pin, at) {
        eprintln!("Wren could not keep when a pin was last used: {error}");
        return false;
    }
    true
}

// A tab Chromium has pinned that is a tab of the list by its role: it
// takes its claim again on the tab pin it was open for before it closed,
// if the Browser's place still shows that pin and the pin is open in no
// Browser of the window, which has one tab for it. Otherwise it stays a
// tab of the list, and is unpinned. A pin that has moved to another space
// since would be drawn in no sidebar of this one.
fn relink(state: &State, browser: &Browser, place: Option<&Place>, tab: BrowserTab) {
    let pin = roles::closed_pin(&tab.persistent_id())
        .filter(|pin| open::opening_near(state, browser, *pin).is_none())
        .and_then(|pin| pin_for(state, place?, pin).ok());
    let linked = match pin {
        Some(PinRow {
            id: pin,
            kind: PinKind::Tab(page),
            ..
        }) => open::link(state, browser, pin, vec![(tab, page)], None).is_ok(),
        _ => false,
    };
    if !linked {
        roles::release(tab);
    }
}
