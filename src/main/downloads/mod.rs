// The downloads a window lists (WrenDownloads.h): Chromium downloads and
// decides; the app reads each download as the page draws it, finds one again
// by the ID the page has, and takes downloads off the list. A window on the
// record lists those of every profile that is open, as the user's spaces are
// of any profile; one off the record lists only its own profile's. And the
// Library button's indicator while they run. Their thumbnails are in
// thumbnails.rs.

pub mod thumbnails;

use std::cell::RefCell;
use std::collections::{HashMap, HashSet};
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;
use wren::unstable_ui::UIText;
use wren::{
    Browser, Download, DownloadAction, DownloadFailure, DownloadIcon, DownloadState,
    DownloadStatus, DownloadWarning, MainThread, Profile, ProfileKind,
};

use crate::platform;

/// A download, as the page draws it.
#[derive(Serialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Item {
    /// Wren's ID, a `u64`, which a JS number cannot hold.
    id: String,
    /// The ID of the profile it is of; off the record, its original's.
    profile: String,
    name: String,
    /// The file's kind, as the platform's file manager says it: "PDF
    /// document"; "" when it has none.
    kind: String,
    /// Where it came from, after redirects.
    url: String,
    status: &'static str,
    paused: bool,
    /// The bytes received so far, and the total; each 0 when not known.
    received: i64,
    total: i64,
    /// Chromium's estimate, in whole seconds; None when it has none.
    seconds_left: Option<i64>,
    /// When it started, and when it ended, in milliseconds since the Unix
    /// epoch; `ended` is None until it has.
    started: u64,
    ended: Option<u64>,
    warning: &'static str,
    /// Chrome's sentence for the warning; "" without one.
    warning_text: String,
    failure: &'static str,
    /// Done, but the file has since been moved or deleted.
    file_removed: bool,
    /// What may be done to it now, by the names `action` takes.
    actions: Vec<&'static str>,
}

/// The Library button's indicator: Chromium's download button, as its
/// toolbar would show it.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Indicator {
    /// Downloads in progress, and their progress together, 0 to 100.
    in_progress: i32,
    percent: i32,
    /// The sizes of all of them are known; if not, the ring spins.
    percent_known: bool,
    /// A file is being scanned; the ring spins.
    scanning: bool,
}

// Each action, by the page's name for it.
const ACTIONS: [(&str, DownloadAction); 9] = [
    ("pause", DownloadAction::PAUSE),
    ("resume", DownloadAction::RESUME),
    ("cancel", DownloadAction::CANCEL),
    ("open", DownloadAction::OPEN),
    ("showInFolder", DownloadAction::SHOW_IN_FINDER),
    ("openWhenDone", DownloadAction::OPEN_WHEN_DONE),
    ("keep", DownloadAction::KEEP),
    ("discard", DownloadAction::DISCARD),
    ("retry", DownloadAction::RETRY),
];

/// When a download started and ended, in milliseconds since the Unix epoch.
#[derive(Clone, Copy)]
struct Times {
    started: u64,
    ended: Option<u64>,
}

thread_local! {
    // TODO: drop once Wren's DownloadState has start_time and end_time. Until
    // then, a download started and ended when the app first saw it so: one
    // from a past run, or from before any window read the list, is new.
    static TIMES: RefCell<HashMap<u64, Times>> = RefCell::default();
    // TODO: drop once Wren has WREN_DOWNLOAD_REMOVE.
    // Until then, a download taken off the list is only hidden, until the app
    // quits.
    static REMOVED: RefCell<HashSet<u64>> = RefCell::default();
    // Each kind of file, by its name's extension.
    static KINDS: RefCell<HashMap<String, String>> = RefCell::default();
}

/// The downloads `browser`'s window lists, each profile's in Chromium's
/// order: in progress first, then paused, then the rest, newest first.
// TODO: the whole history, once Wren lists it beside the bubble's (the last
// 24 hours, at most 30).
pub fn list(browser: &Browser) -> Vec<Item> {
    REMOVED.with_borrow(|removed| {
        listed(browser)
            .iter()
            .flat_map(|profile| {
                let id = profile.original().id();
                downloads(profile)
                    .into_iter()
                    .filter(|(download, _)| !removed.contains(&download.id()))
                    .map(move |(download, state)| item(download, &state, &id))
            })
            .collect()
    })
}

/// The download with the page's ID, among those `browser`'s window lists.
pub fn find(browser: &Browser, id: &str) -> Result<Download, String> {
    let id: u64 = id.parse().map_err(|_| "That is no download's ID.")?;
    listed(browser)
        .iter()
        .flat_map(Profile::downloads)
        .find(|download| download.id() == id)
        .ok_or_else(|| "There is no such download.".into())
}

/// Whether `browser`'s window lists the downloads of the profile with the ID
/// `profile`, and so changes to them.
pub fn lists(browser: &Browser, profile: &str) -> bool {
    listed(browser).iter().any(|listed| {
        // Off the record, its list has its original's too.
        listed.id() == profile || listed.original().id() == profile
    })
}

/// The action with the page's name for it.
pub fn action(name: &str) -> Option<DownloadAction> {
    ACTIONS
        .iter()
        .find(|(each, _)| *each == name)
        .map(|(_, action)| *action)
}

/// Whether the download may be taken off the list: it is over, done,
/// cancelled or failed, as `chrome://downloads` has it.
pub fn removable(state: &DownloadState) -> bool {
    state.status != DownloadStatus::InProgress
}

/// The indicator for `browser`'s window; None while no download runs.
pub fn indicator(browser: &Browser) -> Option<Indicator> {
    let state = browser.download_button_state().ok()?;
    let scanning = state.icon == DownloadIcon::Scanning;
    (state.in_progress > 0 || scanning).then_some(Indicator {
        in_progress: state.in_progress,
        percent: state.percent,
        percent_known: state.percent_known,
        scanning,
    })
}

/// The IDs of the downloads in `now` that have started since `before`: in
/// progress, and not among them.
pub fn started(before: &[Item], now: &[Item]) -> Vec<String> {
    now.iter()
        .filter(|item| item.status == "inProgress" && !before.iter().any(|old| old.id == item.id))
        .map(|item| item.id.clone())
        .collect()
}

/// Takes the download off the list. The file stays.
// TODO: perform WREN_DOWNLOAD_REMOVE once Wren has it.
pub fn remove(download: Download) {
    REMOVED.with_borrow_mut(|removed| removed.insert(download.id()));
}

// The profiles whose downloads `browser`'s window lists: off the record, its
// own; on it, every persistent profile that is open, its own first.
fn listed(browser: &Browser) -> Vec<Profile> {
    let Some(own) = browser.profile() else {
        return Vec::new();
    };
    if own.kind() != ProfileKind::Persistent {
        return vec![own];
    }
    let mut listed = vec![own];
    let open = MainThread::get()
        .map(MainThread::browsers)
        .unwrap_or_default();
    for profile in open.iter().filter_map(Browser::profile) {
        let profile = profile.original();
        if profile.kind() == ProfileKind::Persistent
            && !listed.iter().any(|known| known.id() == profile.id())
        {
            listed.push(profile);
        }
    }
    listed
}

// The Profile's downloads with their state, leaving out one Chromium no
// longer has.
fn downloads(profile: &Profile) -> Vec<(Download, DownloadState)> {
    profile
        .downloads()
        .into_iter()
        .filter_map(|download| Some((download, download.state().ok()?)))
        .collect()
}

fn item(download: Download, state: &DownloadState, profile: &str) -> Item {
    let times = times(download, state);
    let name = download.file_name();
    Item {
        id: download.id().to_string(),
        profile: profile.to_owned(),
        kind: kind(&name),
        name,
        url: download.url(),
        status: match state.status {
            DownloadStatus::InProgress => "inProgress",
            DownloadStatus::Done => "done",
            DownloadStatus::Cancelled => "cancelled",
            DownloadStatus::Failed => "failed",
        },
        paused: state.paused,
        received: state.received_bytes,
        total: state.total_bytes,
        seconds_left: (state.seconds_left >= 0).then_some(state.seconds_left),
        started: times.started,
        ended: times.ended,
        warning: match state.warning {
            DownloadWarning::None => "none",
            DownloadWarning::Dangerous => "dangerous",
            DownloadWarning::Suspicious => "suspicious",
        },
        warning_text: match state.warning {
            DownloadWarning::None => String::new(),
            _ => download.text(UIText::Message),
        },
        failure: match state.failure {
            DownloadFailure::None => "none",
            DownloadFailure::File => "file",
            DownloadFailure::Network => "network",
            DownloadFailure::Server => "server",
            DownloadFailure::Blocked => "blocked",
            DownloadFailure::Crash => "crash",
        },
        file_removed: state.file_removed,
        actions: ACTIONS
            .iter()
            .filter(|(_, action)| state.available().contains(*action))
            .map(|(name, _)| *name)
            .collect(),
    }
}

// The kind of a file named `name`, by its extension.
fn kind(name: &str) -> String {
    let extension = Path::new(name)
        .extension()
        .map(|extension| extension.to_string_lossy().to_lowercase())
        .unwrap_or_default();
    KINDS.with_borrow_mut(|kinds| {
        kinds
            .entry(extension)
            .or_insert_with(|| platform::file_kind(name).unwrap_or_default())
            .clone()
    })
}

// When the download started and ended.
// TODO: read them from DownloadState once Wren has them; see `TIMES`.
fn times(download: Download, state: &DownloadState) -> Times {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |since| since.as_millis() as u64);
    let running = state.status == DownloadStatus::InProgress;
    TIMES.with_borrow_mut(|all| {
        let times = all.entry(download.id()).or_insert(Times {
            started: now,
            ended: None,
        });
        // Retried or resumed, it runs again.
        times.ended = if running {
            None
        } else {
            times.ended.or(Some(now))
        };
        *times
    })
}
