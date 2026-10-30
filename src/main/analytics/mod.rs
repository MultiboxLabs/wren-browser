// Usage data, sent to PostHog (.agent/plans/analytics.md): whether people
// keep using Wren, how it holds up, and which of its own features they use.
// Only what `Event` names is sent, never what is browsed: no address, title,
// text typed or name of the user's. Stable and Beta send; Dev builds and
// performance runs do not, nor any while the user has turned it off
// (Share Usage Data).
//
// Events go to a thread of their own (sender.rs), which sends them in
// batches, so recording one never waits on the network.

mod event;
mod sender;
mod time;

use std::cell::Cell;
use std::panic;
use std::path::PathBuf;
use std::time::{Instant, SystemTime};

use serde_json::{Map, Value, json};

pub use event::{
    Crash, Event, LibrarySection, OmniboxPick, OpensIn, PinKind, PinTo, Setting, SpaceField,
    SplitFrom, TabFrom,
};

use crate::channel::Channel;
use crate::db::{self, Db};
use crate::platform;
use sender::Sender;

/// The PostHog project's key. It only lets one send events to the project,
/// and PostHog means it to be public.
const KEY: &str = "phc_tbTqgFEowbBSpbVfewmt3QYJtEu2j26YSpGBF9YA3CgV";
/// The project's region: the EU.
const HOST: &str = "https://eu.i.posthog.com";
/// Dev builds send too, for trying events out. Never commit it `true`.
const SEND_DEV: bool = false;

const VERSION: &str = env!("CARGO_PKG_VERSION");

pub struct Analytics {
    /// None where this build never sends.
    sending: Option<Sending>,
    /// The user shares usage data (`Settings::share_usage_data`).
    on: Cell<bool>,
    /// When the app started, which `AppOpened` and `AppQuit` count from.
    started: Instant,
    /// `AppOpened` was recorded.
    opened: Cell<bool>,
}

struct Sending {
    sender: Sender,
    /// The install's, the `distinct_id` of every event.
    id: String,
    /// What every event carries besides its own.
    base: Map<String, Value>,
}

/// Whether a build of `channel` sends, in a performance run or not.
fn sends(channel: Channel, perf: bool) -> bool {
    !perf && (SEND_DEV || !matches!(channel, Channel::Dev))
}

impl Analytics {
    /// Starts sending, where this build does, and records an update since
    /// the last run and a crash in it. `on`: the user shares usage data.
    pub fn start(db: &Db, channel: Channel, perf: bool, on: bool) -> Analytics {
        let started = Instant::now();
        let sending = sends(channel, perf).then(|| {
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
                "$lib": "wren",
                // Anonymous events: PostHog makes no person of the ID.
                "$process_person_profile": false,
            });
            let Value::Object(base) = base else {
                unreachable!()
            };
            Sending {
                sender: Sender::start(format!("{HOST}/batch/"), KEY),
                id,
                base,
            }
        });
        let analytics = Analytics {
            sending,
            on: Cell::new(on),
            started,
            opened: Cell::new(false),
        };
        match db.note_version(VERSION) {
            Ok(Some(from_version)) => analytics.record(Event::AppUpdated { from_version }),
            Ok(None) => {}
            Err(error) => eprintln!("Wren could not note its version: {error}"),
        }
        match db.take_crash() {
            Ok(Some(location)) => analytics.record(Event::AppCrashed { location }),
            Ok(None) => {}
            Err(error) => eprintln!("Wren could not read its last crash: {error}"),
        }
        analytics
    }

    pub fn record(&self, event: Event) {
        let Some(sending) = self.sending.as_ref().filter(|_| self.on.get()) else {
            return;
        };
        let Ok(Value::Object(mut properties)) = serde_json::to_value(&event) else {
            return;
        };
        let name = properties.remove("event");
        properties.extend(sending.base.clone());
        sending.sender.send(json!({
            "event": name,
            "distinct_id": sending.id,
            "timestamp": time::rfc3339(SystemTime::now()),
            "properties": properties,
        }));
    }

    /// The user turned sharing usage data on or off. Off, what is queued is
    /// dropped, unsent.
    pub fn set_on(&self, on: bool) {
        if self.on.replace(on)
            && !on
            && let Some(sending) = &self.sending
        {
            sending.sender.clear();
        }
    }

    /// A window was shown: the first records how long the app took to open.
    pub fn window_shown(&self) {
        if !self.opened.replace(true) {
            let launch_ms = self.started.elapsed().as_millis() as u64;
            self.record(Event::AppOpened { launch_ms });
        }
    }

    /// The app quits: records how long it ran, and sends what is left,
    /// waiting a little at most.
    pub fn quit(&self) {
        let session_minutes = self.started.elapsed().as_secs() / 60;
        self.record(Event::AppQuit { session_minutes });
        if let Some(sending) = self.sending.as_ref().filter(|_| self.on.get()) {
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
// app.rs`); one of a dependency's is a path on the machine it was built on,
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
