// Archiving: a tab left unused for as long as the user's setting says
// (db/settings.rs) is closed. What a window shows is never archived, nor is
// a pinned tab: only a Browser's tabs in the background, which the app
// looks over every minute, and as the setting changes.

use std::cell::Cell;
use std::rc::{Rc, Weak};
use std::time::{Duration, SystemTime};

use wren::{Browser, BrowserTab};

use super::placeholder;
use crate::app::State;
use crate::platform;

const EVERY: Duration = Duration::from_secs(60);

thread_local! {
    static LAUNCHED: Cell<Option<SystemTime>> = const { Cell::new(None) };
}

/// Archives what is due now, and then every minute while the app runs.
pub fn start(state: &Rc<State>) {
    LAUNCHED.set(Some(SystemTime::now()));
    look_over(Rc::downgrade(state));
}

fn look_over(state: Weak<State>) {
    let Some(strong) = state.upgrade() else {
        return;
    };
    archive_due(&strong);
    platform::after(EVERY, move || look_over(state));
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
    for window in state.windows.all() {
        if window.is_popup() {
            continue;
        }
        for browser in window.browsers() {
            let due = due(&browser, now, after);
            if !due.is_empty()
                && let Err(error) = super::close(&browser, &due)
            {
                eprintln!("Wren archived no tabs: {error:?}");
            }
        }
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
// active tab, and the other of the active tab's split.
fn shown(browser: &Browser) -> Vec<BrowserTab> {
    let Some(active) = browser.active_tab() else {
        return Vec::new();
    };
    let Some(split) = super::split_of(active) else {
        return vec![active];
    };
    browser
        .tabs()
        .into_iter()
        .filter(|tab| tab.state().is_ok_and(|state| state.split == Some(split)))
        .collect()
}

// Whether `tab` has gone unused for `after`, and nothing keeps it: it is not
// `shown`, pinned or a placeholder.
// TODO: keep, too, a tab that is in use without being shown, once Wren's
// `TabState` says so, as Chrome's tab alerts do: one playing sound (unless
// muted), using the camera or microphone, sharing the screen or being
// captured, in picture-in-picture, or connected to a USB, HID, serial or
// Bluetooth device; and maybe one whose page would ask before it closes
// (beforeunload).
fn should_archive(tab: BrowserTab, shown: &[BrowserTab], now: SystemTime, after: Duration) -> bool {
    if shown.contains(&tab) || placeholder::is_placeholder(tab) {
        return false;
    }
    let Ok(state) = tab.state() else {
        return false;
    };
    !state.pinned
        && now
            .duration_since(last_active(tab))
            .is_ok_and(|unused| unused >= after)
}

// When the tab was last shown.
// TODO: Wren's `TabState::last_active` once it has it, which Chromium keeps
// across launches; it must be when the tab was last shown, so that one left
// after a long while on it counts from then. Until then each tab counts from
// the app's launch, as if it were shown then, and a tab left after the
// setting's time since launch is archived at once.
fn last_active(_tab: BrowserTab) -> SystemTime {
    LAUNCHED.get().unwrap_or_else(SystemTime::now)
}
