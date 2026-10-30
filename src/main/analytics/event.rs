// What analytics sends: each event, by its name in PostHog, with what it
// carries. A property is a number or one of the app's own names, never text
// from a page or the user; the versions and a crash's place are the app's.

use serde::Serialize;
use wren::TabCrash;

#[derive(Debug, Serialize)]
#[serde(tag = "event", rename_all = "snake_case")]
pub enum Event {
    /// The app opened, and showed its first window this long after it
    /// started.
    AppOpened { launch_ms: u64 },
    /// The app quits, having run this long.
    AppQuit { session_minutes: u64 },
    /// The app runs a new version for the first time.
    AppUpdated { from_version: String },
    /// The app panicked in its last run, at this file and line of its source.
    AppCrashed { location: String },
    /// A window's page crashed, and was reloaded.
    PageCrashed,
    /// A tab's page crashed.
    TabCrashed { reason: Crash },
}

/// How a tab's page crashed.
#[derive(Clone, Copy, Debug, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Crash {
    Crashed,
    Killed,
    OutOfMemory,
}

impl Crash {
    /// The crash `crash` is, if it is one.
    pub fn of(crash: TabCrash) -> Option<Crash> {
        match crash {
            TabCrash::None => None,
            TabCrash::Crashed => Some(Crash::Crashed),
            TabCrash::Killed => Some(Crash::Killed),
            TabCrash::OutOfMemory => Some(Crash::OutOfMemory),
        }
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    #[test]
    fn names_the_event_beside_its_properties() {
        let event = Event::TabCrashed {
            reason: Crash::OutOfMemory,
        };
        assert_eq!(
            serde_json::to_value(event).unwrap(),
            json!({ "event": "tab_crashed", "reason": "out_of_memory" })
        );
        assert_eq!(
            serde_json::to_value(Event::PageCrashed).unwrap(),
            json!({ "event": "page_crashed" })
        );
    }
}
