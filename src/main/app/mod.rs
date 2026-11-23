// The core: the app's state (`State`) and startup, here; Wren Runtime's
// callbacks (callbacks.rs); the main menu's commands (commands.rs); and
// which release channel this build is (channel.rs). A callback or a command
// finds the part an event is for and calls it. What happens then is the
// part's to decide.

mod callbacks;
pub mod channel;
mod commands;

pub use callbacks::Wren;

use std::cell::{Cell, RefCell};
use std::path::PathBuf;
use std::rc::Rc;

use wren::{DefaultBrowserState, MainThread, Profile};

use channel::Channel;

use crate::analytics::Analytics;
use crate::db::Db;
use crate::db::SidebarStore;
use crate::ipc::{self, TabSwitcher};
use crate::menus;
use crate::onboarding;
use crate::perf::Perf;
use crate::platform::PageWindow;
use crate::profiles::filling;
use crate::spaces;
use crate::tabs;
use crate::updates::{self, Updates};
use crate::windows::mini_wren::MiniWrens;
use crate::windows::{self, DevTools, Windows};

// What the app holds, shared with the closures it hands Wren.
pub struct State {
    // The pages', not the user's.
    pub(crate) ui_profile: RefCell<Option<Profile>>,
    /// The windows of Chromium's undocked DevTools (windows/devtools.rs).
    pub devtools: DevTools,
    pub windows: Windows,
    // What the pages keep between runs, in `data`; all windows share it.
    pub sidebar: SidebarStore,
    /// What the app keeps of its own, spaces for now.
    pub db: Db,
    pub analytics: Analytics,
    /// Profiles whose last session is being restored (windows/session.rs).
    pub(crate) restoring: Cell<u32>,
    /// The sidebar's performance run, if this is one.
    pub perf: Option<Perf>,
    /// The warning before quitting a window's page shows (ipc/quit.rs).
    pub quit_prompt: RefCell<Option<ipc::OpenQuitPrompt>>,
    /// The tab switcher, while ⌃ is held, and what hears its keys
    /// (ipc/tab_switcher.rs).
    pub tab_switcher: TabSwitcher,
    /// The onboarding window, while the user goes through it, before the
    /// app starts (onboarding.rs).
    pub(crate) onboarding: RefCell<Option<Rc<PageWindow>>>,
    /// What the main menu has the window in front allow, as it was set last
    /// (menus/main_menu.rs).
    pub(crate) menu_front: Cell<menus::Front>,
    /// What Mini Wren keeps: its key, the ones asked for before the app
    /// could open them, and the app each goes back to
    /// (windows/mini_wren/from_apps.rs).
    pub(crate) mini_wrens: MiniWrens,
    /// The app's own updates (updates.rs).
    pub updates: Updates,
    /// The pages to open in new tabs, held until the window the user
    /// browses in has its Browser (windows/held_tabs.rs).
    pub(crate) held_tabs: RefCell<Vec<String>>,
    /// Whether Wren is the default browser, as macOS said last; none before
    /// it says (settings.rs).
    pub(crate) default_browser: Cell<Option<DefaultBrowserState>>,
}

impl State {
    pub fn new(data: PathBuf, channel: Channel, perf: Option<Perf>) -> State {
        let db = Db::open(&data);
        let settings = db.settings().unwrap_or_default();
        filling::start(&settings);
        let on = settings.share_usage_data;
        // The one place that notes the version: noting it forgets the last.
        let updated_from = db.note_version(updates::VERSION).unwrap_or_else(|error| {
            eprintln!("Wren could not note its version: {error}");
            None
        });
        let updates = Updates::new(updated_from.is_some());
        let analytics = Analytics::start(&db, &data, channel, perf.is_some(), on, updated_from);
        State {
            ui_profile: RefCell::default(),
            devtools: DevTools::default(),
            windows: Windows::default(),
            sidebar: SidebarStore::new(&data),
            db,
            analytics,
            restoring: Cell::new(0),
            perf,
            quit_prompt: RefCell::default(),
            tab_switcher: TabSwitcher::default(),
            onboarding: RefCell::default(),
            menu_front: Cell::new(menus::Front {
                switching: true,
                blocked: false,
                mini_wren: false,
            }),
            mini_wrens: MiniWrens::default(),
            updates,
            held_tabs: RefCell::default(),
            default_browser: Cell::default(),
        }
    }

    // Opens the windows open at the last quit, or else the first window, then
    // the user's own Profile, the one Chromium starts with, and each profile
    // they wait for, with the tabs they had (windows/session.rs). Onboarding
    // comes first, until the user has been through it; it calls this again
    // once they have. A performance run has none.
    pub(crate) fn start(self: &Rc<Self>, mt: MainThread) {
        if self.perf.is_none() && !self.db.onboarded() {
            if !onboarding::open(self, mt) {
                eprintln!("Wren could not open onboarding.");
                mt.quit();
            }
            return;
        }
        // The database has each profile, and the app a space, before anything
        // shows them. The list is read again once the first profile is open,
        // in case it was not filled yet.
        self.db.sync_profiles(&mt.profile_list());
        if !windows::open_saved(self, mt) {
            windows::open(self, mt, None);
        }
        if self.windows.len() == 0 {
            eprintln!("Wren made no web view.");
            return mt.quit();
        }
        self.updates.start(self, mt);
        tabs::archive::start(mt, self);
        windows::mini_wren::take_key(self, mt);
        // Restoring from now, while the profile opens: the windows wait for
        // their Browsers, which a Mini Wren must not make first
        // (windows/mini_wren/from_apps.rs).
        windows::restore_started(self);
        let state = self.clone();
        mt.open_profile(None, move |result| match result {
            Ok(profile) => {
                if state.db.sync_profiles(&mt.profile_list()) {
                    spaces::changed(&state);
                }
                // A kept window on a profile deleted since goes.
                windows::leave_gone_profiles(&state, mt);
                menus::update_main_menu(&state, mt);
                windows::restore_sessions(&state, mt, profile);
                windows::restore_finished(&state, mt);
            }
            Err(error) => {
                eprintln!("Wren opened no Profile: {error:?}");
                mt.quit();
            }
        });
    }
}
