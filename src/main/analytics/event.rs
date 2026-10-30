// What analytics sends: each event, by its name in PostHog, with what it
// carries. A property is a number or one of the app's own names, never text
// from a page or the user; the versions, a crash's place and a setting's
// value are the app's. An event marked "page" is one only a window's page
// knows of, which it records with `analytics.record` (ipc/analytics.rs).

use serde::{Deserialize, Serialize};
use wren::{SuggestionKind, TabCrash};

#[derive(Debug, Serialize)]
#[serde(tag = "event", rename_all = "snake_case")]
pub enum Event {
    /// The app opened, and showed its first window this long after it
    /// started.
    AppOpened {
        launch_ms: u64,
    },
    /// The app quits, having run this long.
    AppQuit {
        session_minutes: u64,
    },
    /// The app runs a new version for the first time.
    AppUpdated {
        from_version: String,
    },
    /// The app crashed: it panicked in its last run, at `location`, a file
    /// and line of its source; or Chromium's Crashpad caught a crash, at
    /// `crashed_at` (analytics/crashpad.rs).
    AppCrashed {
        kind: CrashKind,
        #[serde(skip_serializing_if = "Option::is_none")]
        location: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        crashed_at: Option<String>,
    },
    /// A window's page crashed, and was reloaded.
    PageCrashed,
    /// A tab's page crashed.
    TabCrashed {
        reason: Crash,
    },

    // Wren's own features.
    /// The user made a space, and now has `total`.
    SpaceCreated {
        total: usize,
    },
    SpaceDeleted {
        total: usize,
    },
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
}
