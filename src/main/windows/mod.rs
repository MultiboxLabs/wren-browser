// The app's windows: opening them, the Browsers in them, and the spaces they
// show. A window shows one space at a time, and has at most one Browser for
// each space it has been on, which stays in the background while another
// space is in front; a space may have none. A popup's window shows one
// Browser, and no space. The parts:
//
// - open.rs: opening windows, and where each Browser goes;
// - open_urls.rs: the links macOS asks the app to open, in Mini Wren;
// - popup.rs: the windows of popups;
// - switch.rs: switching a window between its spaces;
// - move_tabs.rs: moving tabs from one of its spaces to another;
// - session.rs: keeping the windows, so each comes back as it was;
// - request.rs: what Chromium asks of a window, done.
//
// What a window is, and holds, is shell/'s: `BrowserWindow`
// (shell/browser.rs), and the platform's window round its page.

mod move_tabs;
mod open;
mod open_urls;
mod popup;
mod request;
mod session;
mod switch;

pub use open_urls::LinkSender;
pub use session::keep_session_data;

use std::rc::Rc;

use wren::{MainThread, Profile};

use crate::app::State;
use crate::db::SpaceId;
use crate::ipc;
use crate::menus;
use crate::shell::{BrowserWindow, Place};

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

    /// Every space, in the user's order, of any profile. Each is named, with
    /// its profile's name when there is more than one.
    pub fn ordered_spaces(&self, mt: MainThread) -> Vec<(SpaceId, String)> {
        let profiles = mt.profile_list();
        let spaces = match self.db.list_spaces() {
            Ok(spaces) => spaces,
            Err(error) => {
                eprintln!("Wren could not read the spaces: {error}");
                Vec::new()
            }
        };
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
            .active_tab()
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
    /// they are now; or onboarding's, while it is open. The app icon's menu
    /// follows onboarding too.
    pub fn update_menu(&self, mt: MainThread) {
        let onboarding = self.onboarding.borrow().is_some();
        menus::set_icon_menu(mt, onboarding);
        if onboarding {
            return menus::set_onboarding_menu(mt, self.default_browser.get());
        }
        let front = self.front_menu();
        self.menu_front.set(front);
        let updates = self.updates.available();
        let default = self.default_browser.get();
        menus::set_main_menu(mt, &self.ordered_spaces(mt), front, updates, default);
    }

    /// Asks macOS whether Wren is the default browser, at startup and as it
    /// changes, as Wren's change says only that it did: Set as Default
    /// Browser is checked as it is, and every window's page is told.
    pub fn check_default_browser(self: &Rc<Self>, mt: MainThread) {
        let state = Rc::downgrade(self);
        mt.default_browser_state(move |result| {
            let (Some(state), Ok(default)) = (state.upgrade(), result) else {
                return;
            };
            state.default_browser.set(Some(default));
            menus::set_default_browser_item(mt, Some(default));
            ipc::broadcast_default_browser(&state, default);
        });
    }

    /// Greys out the main menu's items the window in front does not allow,
    /// and brings them back once one that does is in front, or it does
    /// again: switching spaces, which a window on a profile never does, and
    /// the items for its tabs and spaces, which a dialog over it blocks.
    pub fn update_front_menu(&self, mt: MainThread) {
        if self.onboarding.borrow().is_some() {
            return;
        }
        let front = self.front_menu();
        if self.menu_front.replace(front) != front {
            menus::enable_front(mt, &self.ordered_spaces(mt), front);
        }
    }

    // What the window in front allows of the main menu.
    fn front_menu(&self) -> menus::Front {
        let window = self.windows.front();
        menus::Front {
            switching: !window
                .as_ref()
                .is_some_and(|window| window.is_profile_window()),
            blocked: window.is_some_and(|window| window.is_blocked()),
            popup: self
                .windows
                .in_use()
                .is_some_and(|window| window.is_popup()),
        }
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
