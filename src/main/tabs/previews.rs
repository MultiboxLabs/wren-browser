// Pictures of tabs' pages, for the page to draw a tab by where its icon is
// too little, as the tab switcher does (pages/previews.rs keeps and serves
// them). Each tab's is taken as it stops being shown, as the user leaves it
// for another, and is stale once its page changes after. What draws them
// asks for one (`request`): a tab with none, a stale one, or the one shown
// has its picture taken then, in the background too, and the old one stands
// in until it comes. A discarded, crashed or unloaded tab has no page
// shown, so none is taken. What draws a tab with none shows its icon.

use std::cell::RefCell;
use std::collections::HashMap;

use wren::{Browser, BrowserTab, CaptureOptions, ImageFormat, TabCrash};

use super::{placeholder, split_of};
use crate::pages::previews;

/// The largest a picture is, in pixels, wide or high: for a card of 160
/// points at 2x, such as the tab switcher's, which a split's halves share.
const SIZE: u32 = 320;

type Taken = Box<dyn FnOnce(Option<String>)>;

thread_local! {
    // Each Browser's active tab, as it was last seen.
    static ACTIVE: RefCell<HashMap<Browser, BrowserTab>> = RefCell::default();
    // The tabs whose picture is being taken, each with what waits for it:
    // one picture at a time for a tab, which all who asked get.
    static TAKING: RefCell<HashMap<BrowserTab, Vec<Taken>>> = RefCell::default();
}

/// Takes a picture of the tabs `browser` stopped showing, if its active tab
/// changed since it was last seen: the one that was active, and the other
/// half of its split.
pub fn follow_active(browser: &Browser) {
    let Some(now) = browser.active_tab() else {
        return;
    };
    let before = ACTIVE.with_borrow_mut(|active| active.insert(browser.clone(), now));
    let Some(before) = before.filter(|before| *before != now) else {
        return;
    };
    let mut left = vec![before];
    if let Some(split) = split_of(before).and_then(|split| split.state().ok()) {
        left.extend([split.first, split.second].into_iter().flatten());
    }
    for tab in left {
        if !is_shown(tab) && tab.browser().as_ref() == Some(browser) {
            take(tab, Box::new(drop));
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
        take(tab, Box::new(then));
    }
    kept.map(|(name, _)| name)
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

// Whether the tab is on show in its Browser: its active tab, or the other
// half of its split.
fn is_shown(tab: BrowserTab) -> bool {
    let Some(active) = tab.browser().and_then(|browser| browser.active_tab()) else {
        return false;
    };
    tab == active
        || split_of(active)
            .and_then(|split| split.state().ok())
            .is_some_and(|split| split.first == Some(tab) || split.second == Some(tab))
}

// Takes a picture of the tab's page and keeps it, in place of the one it
// had, and gives `then` its ID. One being taken already gives `then` that
// one's. One that may not be taken (`can_take`), or gives none, keeps the
// one it had.
fn take(tab: BrowserTab, then: Taken) {
    if !can_take(tab) {
        return then(None);
    }
    let taking = TAKING.with_borrow_mut(|taking| match taking.get_mut(&tab) {
        Some(waiting) => {
            waiting.push(then);
            true
        }
        None => {
            taking.insert(tab, vec![then]);
            false
        }
    });
    if taking {
        return;
    }
    let options = CaptureOptions {
        max_width: SIZE,
        max_height: SIZE,
        format: ImageFormat::Jpeg,
        // It stays in the app's own UI.
        ignore_policy: true,
        ..Default::default()
    };
    tab.capture(&options, move |image| {
        let name = image.ok().map(|image| previews::keep(tab.id(), image.data));
        let waiting = TAKING.with_borrow_mut(|taking| taking.remove(&tab));
        for then in waiting.unwrap_or_default() {
            then(name.clone());
        }
    });
}
