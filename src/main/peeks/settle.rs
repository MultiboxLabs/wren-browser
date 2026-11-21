// Keeping the peeks right as Chromium changes a Browser's tabs (mod.rs): a
// tab that opens peeks opens a tab in front, or a peek or the tab behind it
// closes, moves or becomes active.

use wren::{Browser, BrowserTab, Change, ChangeKind, TabFields, TabOpenedAs};

use super::{Hold, Peeks, let_go, opens_peeks, to_list};
use crate::app::State;
use crate::tabs::input::{self, InputLock};
use crate::tabs::{self, roles};

/// Settles the Browser's peeks after `change`, one of its tabs' changes,
/// and answers whether any tab's role changed with it, so that the page is
/// told its tabs again. A change of one tab that leaves its pinning and its
/// split as they were leaves them as they are. Any other settles them all:
/// - a tab that opens peeks or is behind one watches its navigations, and
///   no other tab does (navigation.rs);
/// - a tab that comes opened in front by a tab of the Browser that opens
///   peeks is a peek, unless that tab has one already;
/// - a peek whose tab behind has closed or is in another Browser, or that
///   Chromium has unpinned, is a tab of the list;
/// - a peek's tab behind, and the other of its split, ignore input;
/// - a peek that has closed lets them take it again, and the tab behind it
///   is made active if the peek was;
/// - when the tab behind a peek is made active, the peek is made active
///   instead.
pub fn settle(state: &State, browser: &Browser, change: &Change) -> bool {
    let structure = TabFields::PINNED | TabFields::SPLIT;
    if change.kind == ChangeKind::Tab && !change.tab_fields.intersects(structure) {
        return false;
    }
    let peeks = &state.peeks;
    let all = browser.tabs();
    let mut changed = judge_new(peeks, browser, &all);
    changed |= release_stranded(peeks, browser);
    end_holds(peeks);
    hold_behind(peeks, browser);
    // Once the peeks have settled, as a tab behind one watches too.
    watch(&all);
    changed
}

// Makes each of `tabs` that opens peeks or is behind one watch its
// navigations, and every other stop.
fn watch(tabs: &[BrowserTab]) {
    for tab in tabs {
        let watches = opens_peeks(*tab) || roles::peek_of(*tab).is_some();
        if tab
            .state()
            .is_ok_and(|state| state.watches_navigations != watches)
        {
            // It fails only for a tab that has closed.
            let _ = tab.set_watches_navigations(watches);
        }
    }
}

// Judges each of `tabs` the first time it comes, and makes one that a tab of
// `browser` that opens peeks opened in front a peek, unless that tab has one.
// Whether any became one.
fn judge_new(peeks: &Peeks, browser: &Browser, tabs: &[BrowserTab]) -> bool {
    let mut judged = peeks.judged.borrow_mut();
    judged.retain(|tab| tab.browser().is_some());
    let mut changed = false;
    for tab in tabs {
        if !judged.insert(*tab) || !roles::is_listed(*tab) {
            continue;
        }
        let Some(behind) = opened_in_front_by(*tab) else {
            continue;
        };
        let opens = opens_peeks(behind)
            && behind.browser().as_ref() == Some(browser)
            && roles::peek_of(behind).is_none();
        if !opens {
            continue;
        }
        match roles::peek(*tab, behind) {
            Ok(()) => changed = true,
            Err(error) => eprintln!("Wren could not make a peek: {error:?}"),
        }
    }
    changed
}

// The tab that opened `tab` in front, as a link with `target=_blank` or
// Wren's answer to a navigation does, if one did.
fn opened_in_front_by(tab: BrowserTab) -> Option<BrowserTab> {
    let state = tab.state().ok()?;
    (state.opened_as == TabOpenedAs::ForegroundTab)
        .then_some(state.opened_by)
        .flatten()
}

// Makes each peek of `browser` whose tab behind has closed or is in another
// Browser, or that Chromium has unpinned, a tab of the list, at its top, so
// a page the person was reading is never lost. Whether any did.
fn release_stranded(peeks: &Peeks, browser: &Browser) -> bool {
    let mut changed = false;
    for (tab, behind) in roles::peeks(browser) {
        let stays = behind.browser().as_ref() == Some(browser)
            && tab.state().is_ok_and(|state| state.pinned);
        if !stays {
            to_list(peeks, tab);
            changed = true;
        }
    }
    changed
}

// Lets go the hold of each peek that has closed, or is no longer a peek.
// The tab behind one that closed while it was active is made active.
fn end_holds(peeks: &Peeks) {
    let ended: Vec<BrowserTab> = peeks
        .holds
        .borrow()
        .keys()
        .filter(|tab| tab.browser().is_none() || roles::behind(**tab).is_none())
        .copied()
        .collect();
    for tab in ended {
        let closed = tab.browser().is_none();
        if let Some(hold) = let_go(peeks, tab)
            && closed
            && hold.active
        {
            // It fails only for a tab that has closed too.
            let _ = hold.behind.activate();
        }
    }
}

// Locks the input of the tabs behind each of `browser`'s peeks, and makes
// the peek active in place of them.
fn hold_behind(peeks: &Peeks, browser: &Browser) {
    for (tab, behind) in roles::peeks(browser) {
        let locked = tabs::with_split(behind);
        let mut active = browser.active_tab();
        if active.is_some_and(|active| locked.contains(&active)) && tab.activate().is_ok() {
            active = Some(tab);
        }
        let mut holds = peeks.holds.borrow_mut();
        let hold = holds.entry(tab).or_insert_with(|| Hold {
            behind,
            locked: Vec::new(),
            active: false,
        });
        for gone in hold.locked.iter().filter(|each| !locked.contains(each)) {
            input::set_on_tab(*gone, InputLock::Peek, false);
        }
        for each in &locked {
            input::set_on_tab(*each, InputLock::Peek, true);
        }
        hold.locked = locked;
        hold.active = active == Some(tab);
    }
}
