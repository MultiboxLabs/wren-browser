// The spaces windows show. A window shows one space at a time, and has at
// most one Browser for each space it has been on, which stays in the
// background while another space is in front; a space may have none. The
// parts:
//
// - open.rs: opening windows, and where each Browser goes;
// - switch.rs: switching a window between its spaces;
// - session.rs: keeping the windows, so each comes back as it was.
//
// What a window holds is `BrowserWindow`'s (window/browser.rs).

mod open;
mod session;
mod switch;

use wren::{MainThread, Profile};

use crate::app::State;
use crate::db::SpaceId;
use crate::ipc;
use crate::menus;
use crate::window::{BrowserWindow, Place};

impl State {
    /// The profile's most recently used space, if it has one. A profile
    /// Chromium has just made is not in the database yet: it is added, with
    /// no space, so a window on it can be kept.
    pub(super) fn recent_space(&self, mt: MainThread, profile: &Profile) -> Option<SpaceId> {
        let id = profile.id();
        let recent = || match self.db.recent_space(&id) {
            Ok(space) => space.map(|space| space.id),
            Err(error) => {
                eprintln!("Wren could not read the spaces: {error}");
                None
            }
        };
        recent().or_else(|| {
            if self.db.sync_profiles(&mt.profile_list()) {
                ipc::broadcast_spaces(self);
            }
            recent()
        })
    }

    /// Every space, in the Library's order: by profile in Chromium's list,
    /// then by position. Each is named, with its profile's name when there
    /// is more than one.
    pub fn ordered_spaces(&self, mt: MainThread) -> Vec<(SpaceId, String)> {
        let profiles = mt.profile_list();
        let mut spaces = match self.db.list_spaces() {
            Ok(spaces) => spaces,
            Err(error) => {
                eprintln!("Wren could not read the spaces: {error}");
                Vec::new()
            }
        };
        // The list is by profile, then position; the sort keeps that within
        // each, and puts a profile Chromium does not list last.
        let place = |profile: &str| {
            profiles
                .iter()
                .position(|entry| entry.id == profile)
                .unwrap_or(usize::MAX)
        };
        spaces.sort_by_key(|space| place(&space.profile));
        let many = spaces
            .windows(2)
            .any(|pair| pair[0].profile != pair[1].profile);
        spaces
            .into_iter()
            .map(|space| {
                let owner = profiles.iter().find(|entry| entry.id == space.profile);
                let name = match owner {
                    Some(owner) if many => format!("{} — {}", space.name, owner.name),
                    _ => space.name,
                };
                (space.id, name)
            })
            .collect()
    }

    /// Names `window` for its active tab, or with none, for the space it
    /// shows, or the profile, as the page names it; or for the space the
    /// user makes.
    pub fn update_title(&self, window: &BrowserWindow) {
        let tab = window
            .browser_with_tabs()
            .and_then(|browser| browser.active_tab())
            .map(|tab| tab.title())
            .filter(|title| !title.is_empty());
        let making = window.left_space().map(|_| "New Space".to_owned());
        let title = tab.or(making).or_else(|| match window.place()? {
            Place::Space(space) => Some(self.db.space(space).ok()??.name),
            Place::Profile {
                off_the_record: true,
                ..
            } => Some("Incognito".into()),
            Place::Profile { id, .. } => MainThread::get()?
                .profile_list()
                .into_iter()
                .find(|entry| entry.id == id)
                .map(|entry| entry.name),
        });
        window.page.set_title(title.as_deref().unwrap_or("Wren"));
    }

    /// Sets the main menu again, for its Spaces menu to list the spaces as
    /// they are now.
    pub fn update_menu(&self, mt: MainThread) {
        let switching = self.front_switches();
        self.spaces_menu_on.set(switching);
        menus::set_main_menu(mt, &self.ordered_spaces(mt), switching);
    }

    /// Greys out the Spaces menu while a window on a profile is in front,
    /// which never switches, and brings it back once one of spaces is.
    pub fn update_spaces_menu(&self, mt: MainThread) {
        let switching = self.front_switches();
        if self.spaces_menu_on.replace(switching) != switching {
            menus::enable_spaces(mt, &self.ordered_spaces(mt), switching);
        }
    }

    // Whether the window in front switches spaces: any but one on a profile.
    fn front_switches(&self) -> bool {
        !self
            .windows
            .front()
            .is_some_and(|window| window.is_profile_window())
    }

    /// Whether `space` is one of `profile`'s, and still there.
    fn is_space_of(&self, space: SpaceId, profile: &Profile) -> bool {
        matches!(self.db.space(space), Ok(Some(row)) if row.profile == profile.id())
    }

    /// Notes that `space` is in use now.
    pub fn touch_space(&self, space: SpaceId) {
        if let Err(error) = self.db.touch_space(space) {
            eprintln!("Wren could not note a space's use: {error}");
        }
    }
}
