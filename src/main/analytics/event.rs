// What analytics counts: each event, by its name, with what it carries. None
// is sent by itself: each adds to a count (`tally`), and the counts go to
// PostHog with the next `app_opened`. A property is a number or one of the
// app's own names, never text from a page or the user; a crash's place and a
// setting's value are the app's. An event marked "page" is one only a
// window's page knows of, which it records with `analytics.record`
// (ipc/analytics.rs).

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use wren::{SuggestionKind, TabCrash};

#[derive(Debug, Serialize)]
#[serde(tag = "event", rename_all = "snake_case")]
pub enum Event {
    /// The app crashed: it panicked in its last run, at `location`, a file
    /// and line of its source; or Chromium's Crashpad caught a crash
    /// (analytics/crashpad.rs).
    AppCrashed {
        kind: CrashKind,
        #[serde(skip_serializing_if = "Option::is_none")]
        location: Option<String>,
    },
    /// The app ran this long, to the nearest minute, before it quit.
    MinutesUsed {
        minutes: u64,
    },
    /// A window's page crashed, and was reloaded.
    PageCrashed,
    /// A tab's page crashed.
    TabCrashed {
        reason: Crash,
    },

    // Wren's own features.
    /// The user made a space.
    SpaceCreated,
    SpaceDeleted,
    /// A window was brought to another space.
    SpaceSwitched,
    /// A space's name, icon or theme was changed: one event for each.
    SpaceCustomized {
        field: SpaceField,
    },
    TabOpened {
        from: TabFrom,
    },
    TabClosed {
        from: TabFrom,
    },
    /// Tabs left unused long enough were archived (Archive Tabs After).
    TabsArchived {
        count: usize,
    },
    /// A tab became a favourite or a space's pin.
    TabPinned {
        to: PinTo,
    },
    /// An address was dropped on the sidebar as a pin, or a folder made.
    PinAdded {
        kind: PinKind,
    },
    /// A pin went back to the list of tabs.
    PinUnpinned,
    PinDeleted,
    /// Two tabs were made a split.
    SplitOpened {
        from: SplitFrom,
    },
    /// The omnibox opened, for a new tab or the active one's address.
    OmniboxOpened {
        new_tab: bool,
    },
    /// A suggestion of the omnibox, or a bang, was opened.
    OmniboxChose {
        kind: OmniboxPick,
        opens_in: OpensIn,
    },
    /// The sidebar was docked or taken away.
    SidebarToggled {
        docked: bool,
    },
    /// The tab switcher (⌃Tab) was used.
    TabSwitcherUsed,
    /// The user opened the find bar.
    FindOpened,
    /// A side panel was opened (which is not sent: it may be an extension's).
    SidePanelOpened,
    ExtensionPinned {
        pinned: bool,
    },
    /// A window was opened on a profile.
    ProfileWindowOpened,
    /// The user changed a setting, to `value`, the setting's own.
    SettingChanged {
        setting: Setting,
        value: serde_json::Value,
    },
    /// A section of the Library was shown (page).
    LibraryOpened {
        section: LibrarySection,
    },
    /// The downloads shelf was shown, hovering over the Library's button
    /// (page).
    DownloadsShelfOpened,
}

impl Event {
    /// The count this event adds to, and by how much. The count is named by
    /// the event, then each of its properties that is a name, in the order of
    /// their names, all joined by dots; a yes or no is named with its
    /// property, as in `sidebar_toggled.docked=true`. A number is never part
    /// of the name: it is what `tabs_archived` and `minutes_used` add, and
    /// every other event adds 1.
    pub fn tally(&self) -> (String, u64) {
        let amount = match self {
            Event::TabsArchived { count } => *count as u64,
            Event::MinutesUsed { minutes } => *minutes,
            _ => 1,
        };
        let Ok(Value::Object(mut fields)) = serde_json::to_value(self) else {
            unreachable!("an event is a tagged enum")
        };
        let mut name = match fields.remove("event") {
            Some(Value::String(event)) => event,
            _ => unreachable!("an event is tagged with its name"),
        };
        // Sorted here, as the map keeps them in order only by default.
        let fields: BTreeMap<String, Value> = fields.into_iter().collect();
        for (field, value) in fields {
            match value {
                Value::String(value) => name = format!("{name}.{value}"),
                Value::Bool(value) => name = format!("{name}.{field}={value}"),
                _ => {}
            }
        }
        (name, amount)
    }
}

#[derive(Clone, Copy, Debug, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum SpaceField {
    Name,
    Icon,
    Theme,
}

/// Where a tab was opened or closed from.
#[derive(Clone, Copy, Debug, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum TabFrom {
    /// Its button or its menu, in the sidebar.
    Sidebar,
    /// A web address or a file dropped on the sidebar's list.
    Drop,
    /// The keyboard (⌘W) or the main menu.
    Command,
    /// Go Back, on a tab with nothing to go back to, which closes it and
    /// returns to the tab that opened it (tabs/back.rs).
    Back,
}

#[derive(Clone, Copy, Debug, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum PinTo {
    Favorites,
    Space,
}

#[derive(Clone, Copy, Debug, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum PinKind {
    Address,
    Folder,
}

#[derive(Clone, Copy, Debug, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum SplitFrom {
    /// A tab dropped on another.
    Tabs,
    /// A tab of the list joined to a pin.
    Pin,
}

/// What the omnibox opened.
#[derive(Clone, Copy, Debug, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum OmniboxPick {
    Search,
    SearchHistory,
    Url,
    History,
    Bookmark,
    OpenTab,
    Calculator,
    Clipboard,
    Bang,
    Other,
}

impl From<SuggestionKind> for OmniboxPick {
    fn from(kind: SuggestionKind) -> OmniboxPick {
        match kind {
            SuggestionKind::Search => OmniboxPick::Search,
            SuggestionKind::SearchHistory => OmniboxPick::SearchHistory,
            SuggestionKind::Url => OmniboxPick::Url,
            SuggestionKind::History => OmniboxPick::History,
            SuggestionKind::Bookmark => OmniboxPick::Bookmark,
            SuggestionKind::OpenTab => OmniboxPick::OpenTab,
            SuggestionKind::Calculator => OmniboxPick::Calculator,
            SuggestionKind::Clipboard => OmniboxPick::Clipboard,
            SuggestionKind::Other => OmniboxPick::Other,
        }
    }
}

/// Where the omnibox opened what was chosen.
#[derive(Clone, Copy, Debug, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum OpensIn {
    CurrentTab,
    NewTab,
    BackgroundTab,
    NewWindow,
    /// The tab that has it already.
    OpenTab,
}

/// A setting, by its name in `Settings`.
#[derive(Clone, Copy, Debug, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Setting {
    ArchiveAfter,
    AutomaticUpdates,
    BetaUpdates,
    LinksFromApps,
    ShareUsageData,
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LibrarySection {
    Profiles,
    Spaces,
    Boosts,
    Downloads,
    Settings,
}

/// What caught a crash of the app.
#[derive(Clone, Copy, Debug, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum CrashKind {
    /// The app's own code panicked.
    Panic,
    /// Chromium's Crashpad: the browser, the GPU or a renderer.
    Native,
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

    #[test]
    fn tallies_by_the_event_and_its_names() {
        let tally = |event: Event| event.tally();
        assert_eq!(tally(Event::PageCrashed), ("page_crashed".into(), 1));
        assert_eq!(
            tally(Event::OmniboxChose {
                kind: OmniboxPick::Bang,
                opens_in: OpensIn::NewTab,
            }),
            ("omnibox_chose.bang.new_tab".into(), 1)
        );
        assert_eq!(
            tally(Event::SidebarToggled { docked: false }),
            ("sidebar_toggled.docked=false".into(), 1)
        );
        assert_eq!(
            tally(Event::SettingChanged {
                setting: Setting::ArchiveAfter,
                value: json!("12h"),
            }),
            ("setting_changed.archive_after.12h".into(), 1)
        );
        assert_eq!(
            tally(Event::AppCrashed {
                kind: CrashKind::Panic,
                location: Some("src/main/app.rs:10".into()),
            }),
            ("app_crashed.panic.src/main/app.rs:10".into(), 1)
        );
        assert_eq!(
            tally(Event::TabsArchived { count: 4 }),
            ("tabs_archived".into(), 4)
        );
        assert_eq!(
            tally(Event::MinutesUsed { minutes: 25 }),
            ("minutes_used".into(), 25)
        );
    }
}
