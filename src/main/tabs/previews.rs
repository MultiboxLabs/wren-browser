// Pictures of tabs' pages, for the page to draw a tab by where its icon is
// too little, as the tab switcher does (pages/previews.rs keeps and serves
// them). Each tab's is taken as it stops being shown, as the user leaves it
// for another, and is stale once its page changes after. What draws them
// asks for one (`request`): a tab with none, a stale one, or the one shown
// has its picture taken then, in the background too, and the old one stands
// in until it comes. A discarded, crashed or unloaded tab has no page
// shown, so none is taken. What draws a tab with none shows its icon. A
// peek takes one at its page's own size as it goes (`take_whole`), which it
// is drawn by on its way. Such a picture is large, so it is forgotten once
// its tab has closed (`forget_closed`).

use std::cell::RefCell;
use std::collections::{HashMap, HashSet};

use wren::{Browser, BrowserTab, CaptureOptions, ImageFormat, TabCrash};

use super::{placeholder, roles, split_of};
use crate::pages::previews;

/// The largest a picture is, in pixels, wide or high: for a card of 160
/// points at 2x, such as the tab switcher's, which a split's halves share.
const SIZE: u32 = 320;
// A picture as large as the page's own pixels.
const WHOLE: u32 = 0;

type Taken = Box<dyn FnOnce(Option<String>)>;

thread_local! {
    // Each Browser's active tab, as it was last seen.
    static ACTIVE: RefCell<HashMap<Browser, BrowserTab>> = RefCell::default();
    // The tabs whose picture is being taken, at each size, with what waits
    // for it: one picture at a time for a tab and size, which all who asked
    // get.
    static TAKING: RefCell<HashMap<(BrowserTab, u32), Vec<Taken>>> = RefCell::default();
    // The tabs whose picture is as large as their page (`take_whole`).
    static WHOLE_KEPT: RefCell<HashSet<BrowserTab>> = RefCell::default();
}

/// Takes a picture of each tab `browser` stopped showing, if its active tab
/// changed since it was last seen: those shown with the one that was
/// active (`shown_with`) and no longer.
pub fn follow_active(browser: &Browser) {
    let Some(now) = browser.active_tab() else {
        return;
    };
    let before = ACTIVE.with_borrow_mut(|active| active.insert(browser.clone(), now));
    let Some(before) = before.filter(|before| *before != now) else {
        return;
    };
    for tab in shown_with(before) {
        if !is_shown(tab) && tab.browser().as_ref() == Some(browser) {
            take(tab, SIZE, Box::new(drop));
        }
    }
}

/// Notes that the tab's page changed, so its picture is stale: a new page,
/// or one done loading.
pub fn page_changed(tab: BrowserTab) {
    previews::mark_stale(tab.id());
}

/// The ID the tab's picture is served at now, if it has one. If it has
/// none, or it may not be the page as it is (stale, or the tab is shown),
/// a new one is taken, and `then` gets its ID; or None if the tab gave
/// none, and keeps the one it had.
pub fn request(tab: BrowserTab, then: impl FnOnce(Option<String>) + 'static) -> Option<String> {
    let kept = previews::of(tab.id());
    let fresh = kept.as_ref().is_some_and(|(_, fresh)| *fresh) && !is_shown(tab);
    if !fresh {
        take(tab, SIZE, Box::new(then));
    }
    kept.map(|(name, _)| name)
}

/// Takes a picture of the tab's page as it is, as large as its own pixels,
/// in place of the one it had, and gives `then` its ID; or None if the tab
/// gave none.
pub fn take_whole(tab: BrowserTab, then: impl FnOnce(Option<String>) + 'static) {
    WHOLE_KEPT.with_borrow_mut(|kept| kept.insert(tab));
    take(tab, WHOLE, Box::new(then));
}

/// Forgets the pictures as large as their page of the tabs that have
/// closed: the rest are small, and go as more are kept.
pub fn forget_closed() {
    WHOLE_KEPT.with_borrow_mut(|kept| {
        kept.retain(|tab| {
            let open = tab.browser().is_some();
            if !open {
                previews::forget(tab.id());
            }
            open
        });
    });
}

/// Forgets a Browser's active tab, as it closes.
pub fn forget(browser: &Browser) {
    ACTIVE.with_borrow_mut(|active| active.remove(browser));
}

// Whether a picture of the tab may be taken: it has a page, not discarded,
// crashed or unloaded. Capturing an unloaded tab would load it, only for a
// card.
fn can_take(tab: BrowserTab) -> bool {
    !placeholder::is_placeholder(tab)
        && tab
            .state()
            .is_ok_and(|state| !state.discarded && !state.unloaded && state.crash == TabCrash::None)
}

// Whether the tab is on show in its Browser (`shown_with` its active tab).
fn is_shown(tab: BrowserTab) -> bool {
    tab.browser()
        .and_then(|browser| browser.active_tab())
        .is_some_and(|active| shown_with(active).contains(&tab))
}

// The tabs on show while `active` is its Browser's active tab: it, the
// halves of its split, and the tab behind it if it is a peek, darkened
// round it.
fn shown_with(active: BrowserTab) -> Vec<BrowserTab> {
    let mut shown = vec![active];
    if let Some(split) = split_of(active).and_then(|split| split.state().ok()) {
        shown.extend([split.first, split.second].into_iter().flatten());
    }
    shown.extend(roles::behind(active));
    shown
}

// Takes a picture of the tab's page, no more than `size` pixels wide or
// high (`WHOLE` for no limit), and keeps it, in place of the one it had, and
// gives `then` its ID. One being taken at that size already gives `then`
// that one's. One that may not be taken (`can_take`), or gives none, keeps
// the one it had.
fn take(tab: BrowserTab, size: u32, then: Taken) {
    if !can_take(tab) {
        return then(None);
    }
    let taking = TAKING.with_borrow_mut(|taking| match taking.get_mut(&(tab, size)) {
        Some(waiting) => {
            waiting.push(then);
            true
        }
        None => {
            taking.insert((tab, size), vec![then]);
            false
        }
    });
    if taking {
        return;
    }
    let options = CaptureOptions {
        max_width: size,
        max_height: size,
        format: ImageFormat::Jpeg,
        // It stays in the app's own UI.
        ignore_policy: true,
        ..Default::default()
    };
    tab.capture(&options, move |image| {
        let name = image.ok().map(|image| previews::keep(tab.id(), image.data));
        let waiting = TAKING.with_borrow_mut(|taking| taking.remove(&(tab, size)));
        for then in waiting.unwrap_or_default() {
            then(name.clone());
        }
    });
}
