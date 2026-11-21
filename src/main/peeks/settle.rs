// Keeping the peeks right as Chromium changes a Browser's tabs (mod.rs): a
// tab that opens peeks opens a tab in front, or a peek or the tab behind it
// closes, moves or becomes active. Each step is its own function, run in
// the order below, as each depends on the roles the one before left.

use wren::{Browser, BrowserTab, Change, ChangeKind, TabFields, TabOpenedAs};

use super::{Peeks, hold, navigation, opens_peeks, to_list};
use crate::app::State;
use crate::tabs::roles;

/// Settles the Browser's peeks after `change`, one of its tabs' changes,
/// and answers whether any tab's role changed with it, so that the page is
/// told its tabs again. A change of one tab that leaves its pinning and its
/// split as they were leaves them as they are. Any other settles them all:
/// 1. a tab that comes opened in front by a tab of the Browser that opens
///    peeks is a peek, unless that tab has one already;
/// 2. a peek whose tab behind has closed or is in another Browser, or that
///    Chromium has unpinned, is a tab of the list;
/// 3. a peek that has closed or gone to the list lets go its hold on the
///    tabs behind it, and the tab behind is made active if the peek was;
/// 4. when the tab behind a peek is made active, the peek is made active
///    instead;
/// 5. the tabs behind each peek ignore input;
/// 6. a tab that opens peeks or is behind one watches its navigations, and
///    no other tab does (navigation.rs).
pub fn settle(state: &State, browser: &Browser, change: &Change) -> bool {
    let structure = TabFields::PINNED | TabFields::SPLIT;
    if change.kind == ChangeKind::Tab && !change.tab_fields.intersects(structure) {
        return false;
    }
    let peeks = &state.peeks;
    let all = browser.tabs();
    let mut changed = judge_new(peeks, browser, &all);
    changed |= release_stranded(peeks, browser);
    hold::end_released(peeks);
    hold::keep_in_front(browser);
    hold::hold_behind(peeks, browser);
    navigation::watch(&all);
    changed
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
