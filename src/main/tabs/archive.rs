// Archiving: a tab left unused for as long as the user's setting says
// (db/settings.rs) is closed. What a window shows is never archived, nor is
// a pinned tab: only a Browser's tabs in the background, which the app
// looks over every minute, and as the setting changes.

use std::rc::{Rc, Weak};
use std::time::{Duration, SystemTime};

use wren::{Browser, BrowserTab, MainThread, TabAlert, TabState};

use super::placeholder;
use crate::analytics::Event;
use crate::app::State;

const EVERY: Duration = Duration::from_secs(60);

/// Archives what is due now, and then every minute while the app runs.
pub fn start(mt: MainThread, state: &Rc<State>) {
    look_over(mt, Rc::downgrade(state));
}

fn look_over(mt: MainThread, state: Weak<State>) {
    let Some(strong) = state.upgrade() else {
        return;
    };
    archive_due(&strong);
    mt.after(EVERY, move |mt| look_over(mt, state));
}

/// Closes each tab of the windows' Browsers that has gone unused for longer
/// than the setting says. A popup's window has no tabs of the user's to
/// archive.
pub fn archive_due(state: &State) {
    let after = match state.db.settings() {
        Ok(settings) => settings.archive_after.duration(),
        Err(error) => return eprintln!("Wren archived no tabs: {error}"),
    };
    let now = SystemTime::now();
    let mut count = 0;
    for window in state.windows.all() {
        if window.is_popup() {
            continue;
        }
        for browser in window.browsers() {
            let due = due(&browser, now, after);
            if due.is_empty() {
                continue;
            }
            match super::close(&browser, &due) {
                Ok(()) => count += due.len(),
                Err(error) => eprintln!("Wren archived no tabs: {error:?}"),
            }
        }
    }
    if count > 0 {
        state.analytics.record(Event::TabsArchived { count });
    }
}

// The Browser's tabs to archive.
fn due(browser: &Browser, now: SystemTime, after: Duration) -> Vec<BrowserTab> {
    let shown = shown(browser);
    browser
        .tabs()
        .into_iter()
        .filter(|&tab| should_archive(tab, &shown, now, after))
        .collect()
}

// What the Browser's window shows as its space comes to the front: its
// active tab, and the other of the active tab's split. Chromium keeps the
// active tab's last use current itself, but not the other of its split's.
fn shown(browser: &Browser) -> Vec<BrowserTab> {
    let Some(active) = browser.active_tab() else {
        return Vec::new();
    };
    match super::split_of(active).and_then(|split| split.state().ok()) {
        Some(split) => [split.first, split.second].into_iter().flatten().collect(),
        None => vec![active],
    }
}

// Whether `tab` has gone unused for `after`, and nothing keeps it: it is not
// `shown`, pinned, a placeholder or in use.
fn should_archive(tab: BrowserTab, shown: &[BrowserTab], now: SystemTime, after: Duration) -> bool {
    if shown.contains(&tab) || placeholder::is_placeholder(tab) {
        return false;
    }
    let Ok(state) = tab.state() else {
        return false;
    };
    !state.pinned
        && !in_use(&state)
        && now
            .duration_since(super::last_active_in(&state))
            .is_ok_and(|unused| unused >= after)
}

// Whether the tab is in use without being shown, as Chrome's tab alerts say:
// playing sound (unless muted), using the camera or microphone, sharing the
// screen or being captured, in picture-in-picture, or connected to a USB,
// HID, serial or Bluetooth device. Or its page would ask before it closes
// (beforeunload): archiving it would lose what the user wrote there.
fn in_use(state: &TabState) -> bool {
    let mut alerts = state.alert_set().bits();
    if state.muted {
        alerts &= !TabAlert::AUDIBLE.bits();
    }
    alerts != 0 || state.may_ask_before_close
}
