// Find in page: Chromium finds, and the page draws the bar (components/
// find-bar.tsx), which the app answers its request with (`App::popover`).
// Chromium decides when a find opens, by ⌘F or by Find Next, and when it
// ends, as when its tab is switched away from; the page's field sets the
// string, steps through the matches, and closes it.

use std::rc::Rc;

use serde::{Deserialize, Serialize};
use wren::{
    Browser, BrowserTab, Find, MainThread, PageToken, Popover, PopoverAnswer, PopoverKind,
    PopoverRequest, PopoverTrigger, WebView,
};

use super::{WindowRef, failed, give_back_keyboard, with_browser};
use crate::analytics::Event;
use crate::app::State;
use crate::windows::BrowserWindow;

/// The find open in the active tab, as the page's bar shows it.
#[derive(Serialize)]
struct FindBar {
    /// The string it looks for.
    query: String,
    /// The matches of it in the page, and the current one, from 1; 0 for
    /// none current. Both -1 before a result for the string.
    count: i32,
    active: i32,
    /// Chromium is still counting: the numbers may change.
    counting: bool,
}

/// A find opening, or asked for again while open.
#[derive(Serialize)]
struct Shown {
    /// The tab it is on: the bar shows with that tab only, not with the
    /// other side of a split when that becomes the active one.
    tab: Option<i32>,
    /// The string the bar has: the page's selection, or the last one found.
    query: String,
    /// The user asked for it, and the field takes the keyboard; not so
    /// when a tab with a find comes back, which opens it unasked.
    focus: bool,
}

/// How to step through the matches.
#[derive(Deserialize)]
struct Step {
    backwards: bool,
}

/// How a find ends.
#[derive(Deserialize)]
struct End {
    /// Control-Return: it clicks the current match, a link.
    activate: bool,
}

pub fn handle(web_view: &WebView, window: &WindowRef) {
    // The find open in the active tab, or null; "find.state" says when it
    // changes.
    let weak = window.clone();
    let _ = web_view.handle("find.state", move |()| {
        with_browser(&weak, |_, browser| Ok(bar(browser)))
    });

    // As typing in Chrome's bar: Chromium counts and highlights the
    // string's matches, and goes to the first after the current one.
    let weak = window.clone();
    let _ = web_view.handle("find.set", move |text: String| {
        with_browser(&weak, |_, browser| {
            let page = open(browser)?;
            browser.set_find_string(page, &text).map_err(failed)
        })
    });

    // To the next match or the previous one, wrapping at the ends.
    let weak = window.clone();
    let _ = web_view.handle("find.step", move |step: Step| {
        with_browser(&weak, |_, browser| {
            let page = open(browser)?;
            let find = if step.backwards {
                Find::Previous
            } else {
                Find::Next
            };
            browser.find(page, find).map_err(failed)
        })
    });

    // Ends the find, the current match left selected, and gives the active
    // tab's page the keyboard back.
    let weak = window.clone();
    let _ = web_view.handle("find.end", move |end: End| {
        with_browser(&weak, |_, browser| {
            if end.activate {
                browser
                    .find(open(browser)?, Find::EndActivate)
                    .map_err(failed)?;
            } else {
                popover(browser)
                    .ok_or("There is no find open.")?
                    .close()
                    .map_err(failed)?;
            }
            give_back_keyboard(browser);
            Ok(())
        })
    });
}

/// Tells the page the find opened, ended, or changed: its string, or its
/// matches.
pub fn send_find(window: &BrowserWindow, browser: &Browser) {
    let _ = window.page.web_view.send("find.state", &bar(browser));
}

/// Tells the page no find is open: its space has no Browser.
pub fn send_no_find(window: &BrowserWindow) {
    let _ = window.page.web_view.send("find.state", &None::<FindBar>);
}

/// Tells the page a find opened, or was asked for again: its field has the
/// string, and takes the keyboard if `focus`.
pub fn send_show_find(
    window: &BrowserWindow,
    browser: &Browser,
    tab: Option<BrowserTab>,
    focus: bool,
) {
    if focus {
        let _ = window.page.web_view.focus();
    }
    let shown = Shown {
        tab: tab.map(BrowserTab::id),
        query: browser.find_string(),
        focus,
    };
    let _ = window.page.web_view.send("find.show", &shown);
    send_find(window, browser);
}

/// Chromium's find bar, for `App::popover`: the page draws the bar, at the
/// active tab's, and hears of it once Chromium's call is over, when the
/// request is open.
pub fn show_find_bar(state: &Rc<State>, mt: MainThread, request: &PopoverRequest) -> PopoverAnswer {
    // A find the user opened takes the keyboard; one that comes back with
    // its tab does not.
    let focus = request.trigger != PopoverTrigger::Automatic;
    if focus {
        state.analytics.record(Event::FindOpened);
    }
    let state = Rc::downgrade(state);
    let browser = request.browser.clone();
    let tab = request.tab;
    mt.later(move |_| {
        let Some(state) = state.upgrade() else { return };
        if let Some(window) = state.windows.of(&browser)
            && window.is_front(&browser)
        {
            send_show_find(&window, &browser, tab, focus);
        }
    });
    PopoverAnswer::App
}

// The request the app answered with its own bar, while the find is open.
fn popover(browser: &Browser) -> Option<Popover> {
    browser.open_popover(PopoverKind::Find)
}

// The active tab's page, if it has a find open, which the calls act on.
fn open(browser: &Browser) -> Result<PageToken, String> {
    popover(browser)
        .and_then(|_| browser.find_state().ok())
        .filter(|state| state.open)
        .map(|state| state.page)
        .ok_or_else(|| "There is no find open.".into())
}

fn bar(browser: &Browser) -> Option<FindBar> {
    popover(browser)?;
    let state = browser.find_state().ok().filter(|state| state.open)?;
    Some(FindBar {
        query: browser.find_string(),
        count: state.match_count,
        active: state.active_match,
        counting: state.counting,
    })
}
