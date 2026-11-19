// Usage data, sent to PostHog (.agent/plans/analytics.md): whether people
// keep using Wren, how it holds up, and which of its own features they use.
// Only what `Event` names is counted, never what is browsed: no address,
// title, text typed or name of the user's. Stable and Beta send; Dev builds
// and performance runs do not, nor any while the user has turned it off
// (Help Improve Wren).
//
// PostHog's free tier takes a million events a month, so the app sends one
// event a launch: `app_opened`, as the first window shows. Every other event
// adds to a count, saved as it is counted (db/analytics.rs), and the counts
// since the last `app_opened` go with the next one. Each install is a person
// in PostHog, with the app's version and platform as its properties.
//
// The event goes to a thread of its own (sender.rs), so sending never waits
// on the network.

mod crashpad;
mod event;
mod sender;
mod time;

use std::cell::{Cell, RefCell};
use std::panic;
use std::path::{Path, PathBuf};
use std::time::{Instant, SystemTime};

use serde_json::{Map, Value, json};

pub use event::{
    Crash, CrashKind, Event, LibrarySection, OmniboxPick, OpensIn, PinKind, PinTo, Setting,
    SpaceField, SplitFrom, TabFrom,
};

use crate::app::channel::Channel;
use crate::db::{self, Db, UsageCounts, UsageStore};
use crate::platform;
use crate::updates::VERSION;
use sender::Sender;

/// The PostHog project's key. It only lets one send events to the project,
/// and PostHog means it to be public.
const KEY: &str = "phc_tLdkFcdMf9uFWxCWG7a5MurdyGB5BmVJxQ8nSPnK6TAS";
/// The project's region: the EU.
const HOST: &str = "https://eu.i.posthog.com";
/// Dev builds send too, for trying events out. Never commit it `true`.
const SEND_DEV: bool = false;

pub struct Analytics {
    /// None where this build never sends.
    sending: Option<Sending>,
    /// The user shares usage data (`Settings::share_usage_data`).
    on: Cell<bool>,
    /// When the app started, which `app_opened`'s `launch_ms` and the
    /// minutes used count from.
    started: Instant,
    /// `app_opened` was sent, or would have been.
    opened: Cell<bool>,
    /// The version of the last run, if it was another, for `app_opened`.
    updated_from: RefCell<Option<String>>,
}

struct Sending {
    sender: Sender,
    /// The install's, the `distinct_id` of `app_opened`.
    id: String,
    /// The app's version and platform, which `app_opened` carries and sets
    /// on the install's person.
    base: Map<String, Value>,
    /// What was counted since `app_opened` was last sent.
    counts: RefCell<UsageCounts>,
    /// Where `counts` is saved; none if the database can't be opened, when
    /// they're kept for this run alone.
    store: Option<UsageStore>,
}

impl Sending {
    // The install's ID, its base properties, and the counts saved in `data`.
    fn start(db: &Db, data: &Path, channel: Channel) -> Sending {
        let id = db.analytics_id(new_id).unwrap_or_else(|error| {
            eprintln!("Wren could not keep its analytics ID: {error}");
            new_id()
        });
        let base = json!({
            "app_version": VERSION,
            "channel": channel.name(),
            "os": platform::OS_NAME,
            "os_version": platform::os_version(),
            "arch": std::env::consts::ARCH,
        });
        let Value::Object(base) = base else {
            unreachable!()
        };
        let store = UsageStore::open(data)
            .inspect_err(|error| eprintln!("Wren could not open its usage counts: {error}"))
            .ok();
        let counts = match &store {
            Some(store) => store.load().unwrap_or_else(|error| {
                eprintln!("Wren could not read its usage counts: {error}");
                UsageCounts::new()
            }),
            None => UsageCounts::new(),
        };
        Sending {
            sender: Sender::start(format!("{HOST}/batch/"), KEY),
            id,
            base,
            counts: RefCell::new(counts),
            store,
        }
    }

    fn save(&self) {
        if let Some(store) = &self.store
            && let Err(error) = store.save(&self.counts.borrow())
        {
            eprintln!("Wren could not save its usage counts: {error}");
        }
    }
}

/// Whether a build of `channel` sends, in a performance run or not.
fn sends(channel: Channel, perf: bool) -> bool {
    !perf && (SEND_DEV || !matches!(channel, Channel::Dev))
}

impl Analytics {
    /// Starts counting, where this build sends, and counts the crashes since
    /// the last run. `on`: the user shares usage data.
    /// `data`: the app's data folder, Crashpad's among it. `updated_from`: the
    /// version of the last run, if it was another.
    pub fn start(
        db: &Db,
        data: &Path,
        channel: Channel,
        perf: bool,
        on: bool,
        updated_from: Option<String>,
    ) -> Analytics {
        let started = Instant::now();
        let sending = sends(channel, perf).then(|| Sending::start(db, data, channel));
        let analytics = Analytics {
            sending,
            on: Cell::new(on),
            started,
            opened: Cell::new(false),
            updated_from: RefCell::new(updated_from),
        };
        match db.take_crash() {
            Ok(Some(location)) => analytics.record(Event::AppCrashed {
                kind: CrashKind::Panic,
                location: Some(location),
            }),
            Ok(None) => {}
            Err(error) => eprintln!("Wren could not read its last crash: {error}"),
        }
        analytics.record_native_crashes(db, data);
        analytics
    }

    // Those Crashpad caught since the last counted. The mark moves on even
    // while nothing is sent, so turning sharing on sends none from before.
    fn record_native_crashes(&self, db: &Db, data: &Path) {
        let last = match db.last_crash_report() {
            Ok(last) => last,
            Err(error) => return eprintln!("Wren could not read its crash reports: {error}"),
        };
        let (new, mark) = crashpad::new_since(&crashpad::reports(data), last);
        for _ in new {
            self.record(Event::AppCrashed {
                kind: CrashKind::Native,
                location: None,
            });
        }
        if let Some(mark) = mark.filter(|mark| Some(*mark) != last)
            && let Err(error) = db.set_last_crash_report(mark)
        {
            eprintln!("Wren could not note its crash reports: {error}");
        }
    }

    // Where this build sends and the user shares usage data.
    fn sending(&self) -> Option<&Sending> {
        self.sending.as_ref().filter(|_| self.on.get())
    }

    /// Adds `event` to its count, for the next `app_opened`.
    pub fn record(&self, event: Event) {
        let Some(sending) = self.sending() else {
            return;
        };
        let (name, amount) = event.tally();
        if amount == 0 {
            return;
        }
        *sending.counts.borrow_mut().entry(name).or_default() += amount;
        sending.save();
    }

    /// The user turned sharing usage data on or off. Off, what is counted
    /// and what is queued are dropped, unsent.
    pub fn set_on(&self, on: bool) {
        if self.on.replace(on)
            && !on
            && let Some(sending) = &self.sending
        {
            sending.sender.clear();
            sending.counts.borrow_mut().clear();
            sending.save();
        }
    }

    /// A window was shown: the first sends `app_opened`, with how long the
    /// app took to open, the version it was updated from, and the counts.
    pub fn window_shown(&self) {
        if self.opened.replace(true) {
            return;
        }
        let Some(sending) = self.sending() else {
            return;
        };
        let launch_ms = self.started.elapsed().as_millis() as u64;
        let counts = sending.counts.take();
        sending.save();
        let mut properties = Map::new();
        for (name, count) in counts {
            properties.insert(name, count.into());
        }
        properties.extend(sending.base.clone());
        properties.insert("launch_ms".into(), launch_ms.into());
        if let Some(from) = self.updated_from.take() {
            properties.insert("updated_from".into(), from.into());
        }
        properties.insert("$set".into(), Value::Object(sending.base.clone()));
        properties.insert("$lib".into(), "wren".into());
        sending.sender.send(json!({
            "event": "app_opened",
            "distinct_id": sending.id,
            "timestamp": time::rfc3339(SystemTime::now()),
            "properties": properties,
        }));
    }

    /// The app quits: counts the minutes it ran, and sends what is left,
    /// waiting a little at most.
    pub fn quit(&self) {
        let minutes = (self.started.elapsed().as_secs() + 30) / 60;
        self.record(Event::MinutesUsed { minutes });
        if let Some(sending) = self.sending() {
            sending.sender.flush();
        }
    }
}

/// Keeps where the app panics, if this build sends, for the next run to
/// report (`Event::AppCrashed`). The panic goes on as it would.
pub fn catch_panics(data: PathBuf, channel: Channel, perf: bool) {
    if !sends(channel, perf) {
        return;
    }
    let previous = panic::take_hook();
    panic::set_hook(Box::new(move |info| {
        if let Some(location) = info.location() {
            let location = format!("{}:{}", source_file(location.file()), location.line());
            let _ = db::record_crash(&data, &location);
        }
        previous(info);
    }));
}

// A file of the app's own is named from the repository's root (`src/main/
// main.rs`); one of a dependency's is a path on the machine it was built on,
// of which only the crate's folder and the file are kept.
fn source_file(file: &str) -> String {
    if !file.starts_with('/') {
        return file.to_owned();
    }
    let parts: Vec<&str> = file.split('/').collect();
    match parts.iter().rposition(|part| *part == "src") {
        Some(src) if src > 0 => parts[src - 1..].join("/"),
        _ => parts.last().copied().unwrap_or_default().to_owned(),
    }
}

// 128 random bits, as hex.
fn new_id() -> String {
    let mut bytes = [0u8; 16];
    if let Err(error) = getrandom::fill(&mut bytes) {
        eprintln!("Wren could not make an analytics ID: {error}");
    }
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_stable_and_beta_send() {
        assert!(sends(Channel::Stable, false));
        assert!(sends(Channel::Beta, false));
        assert_eq!(sends(Channel::Dev, false), SEND_DEV);
        assert!(!sends(Channel::Stable, true));
    }

    #[test]
    fn names_a_dependency_by_its_crate() {
        assert_eq!(source_file("src/main/app.rs"), "src/main/app.rs");
        assert_eq!(
            source_file("/Users/a/.cargo/registry/src/index/ureq-3.4.2/src/agent.rs"),
            "ureq-3.4.2/src/agent.rs"
        );
        assert_eq!(
            source_file("/rustc/abc/library/core/src/option.rs"),
            "core/src/option.rs"
        );
    }

    #[test]
    fn makes_a_new_id_each_time() {
        assert_eq!(new_id().len(), 32);
        assert_ne!(new_id(), new_id());
    }
}
