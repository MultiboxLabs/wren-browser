// Windows come back as they were. The database keeps each window open at
// quit, with its key, frame, current space and the spaces it has a Browser
// for (db/windows.rs); Chromium keeps each Browser, with a session tag that
// names its window and space (`BrowserWindow::add`). At startup the windows
// open first, each drawing its space empty, and the restored Browsers find
// their way back into them by their tags.

use std::rc::Rc;
use std::time::{SystemTime, UNIX_EPOCH};

use wren::{Browser, MainThread, Profile, RequestedBounds};

use crate::app::State;
use crate::db::{SavedWindow, WindowFrame};
use crate::ipc;
use crate::placeholder;
use crate::window::{BrowserWindow, tagged};

impl State {
    /// Opens the windows kept at the last quit, in the order they opened,
    /// each on its space and where it was. False if there were none.
    pub fn open_saved_windows(self: &Rc<Self>, mt: MainThread) -> bool {
        let saved = self.db.saved_windows().unwrap_or_else(|error| {
            eprintln!("Wren could not read its windows: {error}");
            Vec::new()
        });
        for window in &saved {
            self.open_saved_window(mt, window);
        }
        !saved.is_empty()
    }

    // A window whose space was deleted opens on another it had, or the one
    // used last.
    fn open_saved_window(self: &Rc<Self>, mt: MainThread, saved: &SavedWindow) {
        let space = saved
            .space
            .or_else(|| saved.spaces.first().copied())
            .or_else(|| {
                let recent = self.db.most_recent_space();
                recent.ok().flatten().map(|space| space.id)
            });
        let frame = saved.frame.map(|frame| RequestedBounds {
            origin: Some((frame.x, frame.y)),
            width: frame.width,
            height: frame.height,
        });
        let id = self.open_keyed_window(mt, saved.key.clone(), space, frame);
        if id.is_none() {
            eprintln!("Wren could not open a window it kept.");
        }
    }

    /// Restores the last session of `startup`, the profile Chromium starts
    /// with, and of every profile the kept windows have a space's Browser
    /// of, each once: a second restore of a profile would bring its windows
    /// twice.
    pub fn restore_sessions(self: &Rc<Self>, mt: MainThread, startup: Profile) {
        let profiles = self.db.saved_window_profiles().unwrap_or_else(|error| {
            eprintln!("Wren could not read its windows: {error}");
            Vec::new()
        });
        let startup_id = startup.id();
        self.restore(mt, startup, true);
        for id in profiles.into_iter().filter(|id| *id != startup_id) {
            let state = self.clone();
            // Restoring from now, so a Browser of the startup profile's
            // restore is not taken for one of a later launch.
            self.restoring.set(self.restoring.get() + 1);
            mt.open_profile(Some(&id), move |result| {
                match result {
                    Ok(profile) => state.restore(mt, profile, false),
                    Err(error) => eprintln!("Wren opened no Profile to restore: {error:?}"),
                }
                state.restoring.set(state.restoring.get() - 1);
            });
        }
    }

    // Restores `profile`'s last session, whose windows arrive in
    // `place_opened`. With nothing restored, and if `fills`, the window that
    // waits for a Browser opens on the profile's most recent space, with no
    // tab yet.
    fn restore(self: &Rc<Self>, mt: MainThread, profile: Profile, fills: bool) {
        let state = self.clone();
        self.restoring.set(self.restoring.get() + 1);
        profile.clone().restore_last_session(move |result| {
            state.restoring.set(state.restoring.get() - 1);
            if let Err(error) = result {
                eprintln!("Wren restored no session: {error:?}");
            }
            let Some(window) = state.windows.waiting().filter(|_| fills) else {
                return;
            };
            let Some(space) = state.recent_space(mt, &profile) else {
                return eprintln!("Wren found no space to open.");
            };
            window.switch_to(space);
            ipc::send_space(&window);
            state.save_window(&window);
            state.touch_space(space);
            state.open_space_browser(mt, window.id, space, || {});
        });
    }

    /// Puts `browser`, of `profile`, back into the window and space its tag
    /// names: a restored one, or one Reopen Closed Window brought back. In
    /// front if that is the window's current space, else in the background.
    /// False if the tag names no window open now, a space that is gone or
    /// another profile's, or one the window has a Browser for already.
    pub fn place_tagged(&self, browser: &Browser, profile: &Profile) -> bool {
        let Some((key, space)) = tagged(browser) else {
            return false;
        };
        let Some(window) = self.windows.by_key(&key) else {
            return false;
        };
        let owned = matches!(self.db.space(space), Ok(Some(row)) if row.profile == profile.id());
        if !owned || window.browser_of(space).is_some() || window.is_opening(space) {
            return false;
        }
        placeholder::adopt(browser);
        window.add(space, browser.clone());
        if window.is_front(browser) {
            ipc::send_browser(&window, browser);
        }
        self.save_window(&window);
        true
    }

    /// Whether a restored `browser` is what is left of a window the user
    /// closed. Chromium keeps the last Browser a window closes in the session,
    /// as Chrome keeps the last window, while the window is forgotten: its
    /// tag names a window that did not come back. It closes, rather than
    /// come back as a window of one space at the closed one's size. Reopen
    /// Closed Window, later, still brings it back.
    pub fn is_left_by_closed_window(&self, browser: &Browser) -> bool {
        self.restoring.get() > 0
            && tagged(browser).is_some_and(|(key, _)| self.windows.by_key(&key).is_none())
    }

    /// Keeps `window`'s current space and the spaces it has a Browser for.
    /// A Browser that closes is not noted: at quit, each closes before the
    /// app hears of the quit, and the window must keep it. The next save
    /// drops it.
    pub fn save_window(&self, window: &BrowserWindow) {
        let saved = self
            .db
            .save_window(&window.key, window.space(), &window.open_spaces());
        if let Err(error) = saved {
            eprintln!("Wren could not keep a window: {error}");
        }
    }

    /// Keeps where `window` is on screen; not while it is in full screen.
    pub fn save_frame(&self, window: &BrowserWindow) {
        let Some(frame) = window.page.frame() else {
            return;
        };
        let (x, y) = frame.origin.unwrap_or_default();
        let frame = WindowFrame {
            x,
            y,
            width: frame.width,
            height: frame.height,
        };
        if let Err(error) = self.db.save_window_frame(&window.key, frame) {
            eprintln!("Wren could not keep a window's frame: {error}");
        }
    }

    /// Forgets a window the user closed, so it does not come back.
    pub fn forget_window(&self, window: &BrowserWindow) {
        if let Err(error) = self.db.forget_window(&window.key) {
            eprintln!("Wren could not forget a window: {error}");
        }
    }

    /// Keeps a window about to open, and answers its key. One the database
    /// cannot keep has a key of its own still, for its Browsers' tags.
    pub fn new_window_key(&self) -> String {
        self.db.add_window().unwrap_or_else(|error| {
            eprintln!("Wren could not keep a window: {error}");
            let now = SystemTime::now().duration_since(UNIX_EPOCH);
            format!("unkept-{:x}", now.map_or(0, |since| since.as_nanos()))
        })
    }
}
