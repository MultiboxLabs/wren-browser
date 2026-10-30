// Windows come back as they were. The database keeps each window open at
// quit, with its key, frame, current space and the spaces it has a Browser
// for, or the profile it shows (db/windows.rs); Chromium keeps each Browser,
// with a session tag that names its window and place (`BrowserWindow::add`).
// At startup the windows open first, each drawing its place empty, and the
// restored Browsers find their way back into them by their tags. An
// off-the-record window is never kept.

use std::rc::Rc;
use std::time::{SystemTime, UNIX_EPOCH};

use wren::{Browser, MainThread, Profile, RequestedBounds};

use crate::app::State;
use crate::db::{SavedWindow, WindowFrame};
use crate::shell::{BrowserWindow, Place, Tag};
use crate::tabs::placeholder;

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

    // A window on a profile opens on it. One whose space was deleted opens
    // on another it had, or the one used last.
    fn open_saved_window(self: &Rc<Self>, mt: MainThread, saved: &SavedWindow) {
        let place = match &saved.profile {
            Some(id) => Some(Place::Profile {
                id: id.clone(),
                off_the_record: false,
            }),
            None => saved
                .space
                .or_else(|| saved.spaces.first().copied())
                .or_else(|| {
                    let recent = self.db.most_recent_space();
                    recent.ok().flatten().map(|space| space.id)
                })
                .map(Place::Space),
        };
        let frame = saved.frame.map(|frame| RequestedBounds {
            origin: Some((frame.x, frame.y)),
            width: frame.width,
            height: frame.height,
        });
        let id = self.open_keyed_window(mt, saved.key.clone(), place, frame);
        if id.is_none() {
            eprintln!("Wren could not open a window it kept.");
        }
    }

    /// Restores the last session of `startup`, the profile Chromium starts
    /// with, and of every profile the kept windows have a space's Browser
    /// of or show, each once: a second restore of a profile would bring its
    /// windows twice.
    pub fn restore_sessions(self: &Rc<Self>, mt: MainThread, startup: Profile) {
        let profiles = self.db.saved_window_profiles().unwrap_or_else(|error| {
            eprintln!("Wren could not read its windows: {error}");
            Vec::new()
        });
        let startup_id = startup.id();
        self.restore(mt, startup, true);
        for id in profiles.into_iter().filter(|id| *id != startup_id) {
            let state = self.clone();
            // Restoring from now, while the profile opens.
            self.restore_started();
            mt.open_profile(Some(&id), move |result| {
                match result {
                    Ok(profile) => state.restore(mt, profile, false),
                    Err(error) => eprintln!("Wren opened no Profile to restore: {error:?}"),
                }
                state.restore_finished();
            });
        }
    }

    // Restores `profile`'s last session, whose windows arrive in
    // `place_opened`. A kept window on the profile that got no Browser back
    // is given one with no tab yet. With nothing restored, and if `fills`,
    // the window that waits for a Browser opens on the profile's most recent
    // space, or on the profile if it has none, with no tab yet.
    fn restore(self: &Rc<Self>, mt: MainThread, profile: Profile, fills: bool) {
        let state = self.clone();
        self.restore_started();
        profile.clone().restore_last_session(move |result| {
            state.restore_finished();
            if let Err(error) = result {
                eprintln!("Wren restored no session: {error:?}");
            }
            let place = Place::of_profile(&profile);
            for window in state.windows.all() {
                if window.place().as_ref() == Some(&place) && window.browser().is_none() {
                    state.open_browser(mt, window.id, place.clone(), || {});
                }
            }
            let Some(window) = state.windows.waiting().filter(|_| fills) else {
                return;
            };
            // A profile with no space: the window is on the profile.
            let Some(space) = state.recent_space(mt, &profile) else {
                return state.open_browser(mt, window.id, place, || {});
            };
            if let Err(error) = state.show_space(window.id, space) {
                return eprintln!("Wren could not open a space: {error}");
            }
            state.open_browser(mt, window.id, Place::Space(space), || {});
        });
    }

    /// Puts `browser`, of `profile`, back into the window and place its tag
    /// names: a restored one, or one Reopen Closed Window brought back. In
    /// front if that is the window's current place, else in the background.
    /// False if the tag names no window open now, a space that is gone or
    /// another profile's, a profile the window does not show, or a place the
    /// window has a Browser for already.
    pub(super) fn place_tagged(&self, browser: &Browser, profile: &Profile) -> bool {
        let Some((key, place)) = Tag::of(browser).window else {
            return false;
        };
        let Some(window) = self.windows.by_key(&key) else {
            return false;
        };
        let free = window.browser_of(&place).is_none() && !window.is_opening(&place);
        let fits = match place.space() {
            Some(space) => !window.is_profile_window() && self.is_space_of(space, profile),
            None => window.place().as_ref() == Some(&place) && Place::of_profile(profile) == place,
        };
        if !free || !fits {
            return false;
        }
        placeholder::adopt(browser);
        self.host(&window, place, browser);
        true
    }

    /// Whether a restored `browser` is what is left of a window the user
    /// closed. Chromium keeps the last Browser a window closes in the session,
    /// as Chrome keeps the last window, while the window is forgotten: its
    /// tag names a window that did not come back. It closes, rather than
    /// come back as a window of one space at the closed one's size. Reopen
    /// Closed Window, later, still brings it back.
    pub(super) fn is_left_by_closed_window(&self, browser: &Browser) -> bool {
        self.is_restoring()
            && Tag::of(browser)
                .window
                .is_some_and(|(key, _)| self.windows.by_key(&key).is_none())
    }

    /// Keeps `window`'s current space and the spaces it has a Browser for,
    /// or the profile it shows; a popup's window is never kept. A window
    /// making a space keeps the one it left, to come back on.
    /// A Browser that closes is not noted: at quit, each closes before the
    /// app hears of the quit, and the window must keep it. The next save
    /// drops it.
    pub fn save_window(&self, window: &BrowserWindow) {
        if window.is_popup() {
            return;
        }
        // An off-the-record window is never kept.
        let place = window.place().filter(|place| !place.is_off_the_record());
        let saved = self.db.save_window(
            &window.key,
            window.space().or(window.left_space()),
            &window.open_spaces(),
            place.as_ref().and_then(Place::profile),
        );
        if let Err(error) = saved {
            eprintln!("Wren could not keep a window: {error}");
        }
    }

    /// Keeps where `window` is on screen; not while it is in full screen,
    /// nor a popup's.
    pub fn save_frame(&self, window: &BrowserWindow) {
        if window.is_popup() {
            return;
        }
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
    pub(super) fn new_window_key(&self) -> String {
        self.db.add_window().unwrap_or_else(|error| {
            eprintln!("Wren could not keep a window: {error}");
            unkept_window_key()
        })
    }

    /// Whether a profile's last session is being restored. Chromium asks to
    /// bring forward what it had active as it restores it, which is no
    /// request of the user's.
    pub fn is_restoring(&self) -> bool {
        self.restoring.get() > 0
    }

    fn restore_started(&self) {
        self.restoring.set(self.restoring.get() + 1);
    }

    fn restore_finished(&self) {
        self.restoring.set(self.restoring.get() - 1);
    }
}

/// A key for a window the database does not keep, for its Browsers' tags:
/// an off-the-record one, or one the database failed to keep.
pub(super) fn unkept_window_key() -> String {
    let now = SystemTime::now().duration_since(UNIX_EPOCH);
    format!("unkept-{:x}", now.map_or(0, |since| since.as_nanos()))
}
