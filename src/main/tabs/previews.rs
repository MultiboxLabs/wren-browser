// Pictures of tabs' pages, for the page to draw a tab by where its icon is
// too little, as the tab switcher does (pages/previews.rs keeps and serves
// them). Each tab's is taken as it stops being shown, as the user leaves it
// for another, so what draws them takes none. A tab not yet left has none,
// and what draws it shows its icon.

use std::cell::RefCell;
use std::collections::HashMap;

use wren::{Browser, BrowserTab, CaptureOptions, ImageFormat};

use super::{placeholder, split_of};
use crate::pages::previews;

/// The largest a picture is, in pixels, wide or high: for a card of 160
/// points at 2x, such as the tab switcher's, which a split's halves share.
const SIZE: u32 = 320;

thread_local! {
    // Each Browser's active tab, as it was last seen.
    static ACTIVE: RefCell<HashMap<Browser, BrowserTab>> = RefCell::default();
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
    let shown = split_of(now).and_then(|split| split.state().ok());
    for tab in left {
        let still_shown = tab == now
            || shown
                .as_ref()
                .is_some_and(|split| split.first == Some(tab) || split.second == Some(tab));
        if !still_shown && tab.browser().as_ref() == Some(browser) {
            capture(tab);
        }
    }
}

/// The ID the tab's picture is served at, if it has one.
pub fn of(tab: BrowserTab) -> Option<String> {
    previews::of(tab.id())
}

/// Forgets a Browser's active tab, as it closes.
pub fn forget(browser: &Browser) {
    ACTIVE.with_borrow_mut(|active| active.remove(browser));
}

// Takes a picture of the tab's page and keeps it, in place of the one it
// had. One with none to give (discarded, crashed) keeps the one it had.
fn capture(tab: BrowserTab) {
    if placeholder::is_placeholder(tab) {
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
        if let Ok(image) = image {
            previews::keep(tab.id(), image.data);
        }
    });
}
