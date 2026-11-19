// The downloads a window lists (WrenDownloads.h): Chromium downloads and
// decides; the app reads each download as the page draws it, finds one again
// by the ID the page has, and takes downloads off the list. A window lists
// two: the shelf's, Chrome's bubble's, and the Library's, the whole history.
// A window on the record lists those of every profile that is open, as the
// user's spaces are of any profile; one off the record lists only its own
// profile's. And the Library button's indicator while they run. Their
// thumbnails are in thumbnails.rs. What a download's menu does is here too
// (`choose`).

pub mod thumbnails;

use std::cell::RefCell;
use std::collections::HashMap;
use std::path::Path;

use serde::Serialize;
use wren::unstable_ui::UIText;
use wren::{
    Browser, Download, DownloadAction, DownloadFailure, DownloadIcon, DownloadState,
    DownloadStatus, DownloadWarning, Error, MainThread, Profile, ProfileKind,
};

use crate::clipboard;
use crate::menus::download as menu;
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

thread_local! {
    // Each kind of file, by its name's extension.
    static KINDS: RefCell<HashMap<String, String>> = RefCell::default();
}

/// The downloads the shelf of `browser`'s window lists, Chrome's bubble's
/// (the last 24 hours, at most 30), each profile's in Chromium's order: in
/// progress first, then paused, then the rest, newest first.
pub fn list(browser: &Browser) -> Vec<Item> {
    items(browser, Profile::downloads)
}

/// The downloads the Library of `browser`'s window lists: each profile's
/// whole history, as chrome://downloads has it, newest first.
pub fn history(browser: &Browser) -> Vec<Item> {
    items(browser, Profile::download_history)
}

/// The download with the page's ID, among those `browser`'s window lists.
/// The history has the bubble's too.
pub fn find(browser: &Browser, id: &str) -> Result<Download, String> {
    let id: u64 = id.parse().map_err(|_| "That is no download's ID.")?;
    listed(browser)
        .iter()
        .flat_map(Profile::download_history)
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
/// cancelled or failed, and policy lets it, as `chrome://downloads` has it.
pub fn removable(state: &DownloadState) -> bool {
    state.available().contains(DownloadAction::REMOVE)
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

/// Takes the download off the list, and out of the history. The file stays.
pub fn remove(download: Download) -> Result<(), Error> {
    download.perform(DownloadAction::REMOVE)
}

// The profiles whose downloads `browser`'s window lists: off the record, its
// own; on it, every persistent profile that is open, its own first.
/// Does what was chosen of `download`'s menu (menus/download.rs), which
/// listed it as `state` had it.
pub fn choose(download: Download, state: &DownloadState, chosen: &str) -> Result<(), Error> {
    match chosen {
        menu::OPEN => download.perform(DownloadAction::OPEN),
        menu::SHOW => download.perform(DownloadAction::SHOW_IN_FINDER),
        menu::OPEN_WHEN_DONE => download.perform(DownloadAction::OPEN_WHEN_DONE),
        menu::COPY_LINK => clipboard::copy_link(&download.url(), None, state.off_the_record),
        menu::REMOVE => remove(download),
        _ => Ok(()),
    }
}

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

// The downloads `read` gives of each profile `browser`'s window lists, each
// tagged with its profile, leaving out one Chromium no longer has.
fn items(browser: &Browser, read: fn(&Profile) -> Vec<Download>) -> Vec<Item> {
    listed(browser)
        .iter()
        .flat_map(|profile| {
            let id = profile.original().id();
            read(profile).into_iter().filter_map(move |download| {
                let state = download.state().ok()?;
                Some(item(download, &state, &id))
            })
        })
        .collect()
}

fn item(download: Download, state: &DownloadState, profile: &str) -> Item {
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
        started: u64::try_from(state.start_ms).unwrap_or(0),
        // Only one that is done has ended: Chromium keeps no time for one
        // cancelled or failed.
        ended: u64::try_from(state.end_ms).ok().filter(|ms| *ms > 0),
        warning: match state.warning {
            DownloadWarning::None => "none",
            DownloadWarning::Dangerous => "dangerous",
            DownloadWarning::Suspicious => "suspicious",
        },
        warning_text: match state.warning {
            DownloadWarning::None => String::new(),
            _ => download.ui_text(UIText::Message),
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
