// The app's updates. The platform's updater (platform/updater.rs) checks
// and downloads; this says what it is doing to Chromium's About page and to
// each window's update card (ipc/update.rs), answers Check for Updates…,
// and hands the relaunch to the updater, which installs the update before
// it launches the app again. It is also told, as the app starts, whether the
// version is new since the last run, which the windows show.
//
// A download shows in the card only when the card offered the update, or
// the user asked by Check for Updates…: with Automatic Updates on, updates
// download out of sight, and the card shows once one is ready.

use std::cell::{Cell, RefCell};
use std::collections::HashSet;
use std::rc::{Rc, Weak};

use serde::Serialize;
use wren::{MainThread, UpdateState, UpdateStatus};

use crate::app::State;
use crate::db::Settings;
use crate::ipc::{self, OwnToast};
use crate::platform::{Updater, UpdaterOptions, UpdaterState};
use crate::shell::WindowId;

/// The version that runs: `Cargo.toml`'s, which a release sets along with the
/// manifests' (scripts/publish.ts).
pub const VERSION: &str = env!("CARGO_PKG_VERSION");

/// Where the update is, as the card shows it.
#[derive(Clone, Copy, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Phase {
    /// Nothing to show.
    None,
    /// Found, to download.
    Available,
    Downloading,
    /// Downloaded, to install as the app restarts or quits.
    Ready,
}

/// The update, as the card shows it.
#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Shown {
    pub phase: Phase,
    pub version: Option<String>,
    /// `Phase::Downloading`: from 0 to 1, or none while it is not known.
    pub progress: Option<f32>,
    /// The version just installed, until its card is closed.
    pub installed: Option<String>,
}

#[derive(Default)]
pub struct Updates {
    updater: RefCell<Option<Updater>>,
    installed: RefCell<Option<String>>,
    /// The download under way shows in the card.
    shown: Cell<bool>,
    /// The window Check for Updates… was chosen in, until the check ends.
    asked: Cell<Option<WindowId>>,
    /// The windows that opened with the app, on a version just installed:
    /// each plays what it shows of it once (components/updated.tsx).
    sweeps: RefCell<HashSet<WindowId>>,
}

impl Updates {
    /// `installed`: this version is new since the last run (a first run has
    /// none before it).
    pub fn new(installed: bool) -> Updates {
        Updates {
            installed: RefCell::new(installed.then(|| VERSION.to_string())),
            ..Updates::default()
        }
    }

    /// Starts the updater, if the app has one, with the windows the app
    /// opened with. On a version just installed, those windows say so.
    pub fn start(&self, state: &Rc<State>, mt: MainThread) {
        if self.installed.borrow().is_some() {
            *self.sweeps.borrow_mut() =
                state.windows.all().iter().map(|window| window.id).collect();
        }
        let settings = state.db.settings().unwrap_or_default();
        let weak = Rc::downgrade(state);
        let updater = Updater::start(
            options(&settings),
            Box::new(move |updater_state| changed(&weak, updater_state)),
        );
        let Some(updater) = updater else {
            return;
        };
        // About shows a line from now on, and asks for a check as it opens
        // (Settings, which it is a page of, asks as it loads).
        set_about(mt, &updater.state());
        *self.updater.borrow_mut() = Some(updater);
        state.update_menu(mt);
    }

    /// The app has an updater: Check for Updates… can check.
    pub fn available(&self) -> bool {
        self.updater.borrow().is_some()
    }

    pub fn shown(&self) -> Shown {
        let updater = self.updater.borrow();
        let state = updater.as_ref().map_or(UpdaterState::Idle, Updater::state);
        let (phase, version, progress) = match state {
            UpdaterState::Available { version } => (Phase::Available, Some(version), None),
            UpdaterState::Downloading { version, progress } if self.shown.get() => {
                (Phase::Downloading, Some(version), progress)
            }
            UpdaterState::Ready { version } => (Phase::Ready, Some(version), None),
            _ => (Phase::None, None, None),
        };
        Shown {
            phase,
            version,
            progress,
            installed: self.installed.borrow().clone(),
        }
    }

    /// Whether window `id` opened with the app on a version just installed,
    /// and has not been told yet.
    pub fn take_sweep(&self, id: WindowId) -> bool {
        self.sweeps.borrow_mut().remove(&id)
    }

    /// The card's Download Update.
    pub fn download(&self, state: &State) {
        self.shown.set(true);
        if let Some(updater) = &*self.updater.borrow() {
            updater.download();
        }
        ipc::broadcast_update(state);
    }

    /// The card's close button: done with the version just installed.
    pub fn dismiss(&self, state: &State) {
        self.installed.borrow_mut().take();
        ipc::broadcast_update(state);
    }

    /// Automatic Updates or Beta Updates changed. Beta Updates turned on
    /// checks at once, for the beta to come without a wait.
    pub fn settings_changed(&self, settings: &Settings, beta_was: bool) {
        if let Some(updater) = &*self.updater.borrow() {
            updater.set_options(options(settings));
            if settings.beta_updates && !beta_was {
                updater.check(false);
            }
        }
    }

    /// Check for Updates…, chosen in `window`: an update shows in its card;
    /// with none, a toast says so once the check is over.
    pub fn check(&self, state: &State, window: WindowId) {
        let Some(now) = self.updater.borrow().as_ref().map(Updater::state) else {
            return;
        };
        match now {
            UpdaterState::Available { .. }
            | UpdaterState::Downloading { .. }
            | UpdaterState::Ready { .. } => {
                self.shown.set(true);
                ipc::broadcast_update(state);
                if let Some(window) = state.windows.get(window) {
                    ipc::send_open_update(&window);
                }
            }
            _ => {
                self.asked.set(Some(window));
                if let Some(updater) = &*self.updater.borrow() {
                    updater.check(true);
                }
            }
        }
    }

    /// Chromium's Settings asks as it opens, About being one of its pages:
    /// a check, unless an update waits.
    pub fn about_asked(&self) {
        if let Some(updater) = &*self.updater.borrow() {
            updater.check(false);
        }
    }

    /// The quit can no longer be cancelled. A relaunch with an update ready
    /// is the updater's: it installs the update, then launches the app. A
    /// plain quit leaves the update to the updater too, which installs it
    /// once the app has quit, without launching it.
    pub fn quit_committed(&self, mt: MainThread) {
        if let Some(updater) = &*self.updater.borrow()
            && matches!(updater.state(), UpdaterState::Ready { .. })
            && mt.is_relaunching()
            && mt.leave_relaunch_to_app().is_ok()
        {
            updater.install_and_relaunch();
        }
    }

    // The updater's new state. A download shows once the card has offered
    // the update, whatever starts it: the card, Automatic Updates turned on,
    // or About.
    fn update(&self, state: &State, mt: MainThread, now: &UpdaterState) {
        match now {
            UpdaterState::Downloading { .. } | UpdaterState::Ready { .. } => {}
            UpdaterState::Available { .. } => self.shown.set(true),
            _ => self.shown.set(false),
        }
        set_about(mt, now);
        self.answer(state, now);
        ipc::broadcast_update(state);
    }

    // Check for Updates…'s answer, once the check is over.
    fn answer(&self, state: &State, now: &UpdaterState) {
        let Some(id) = self.asked.get() else {
            return;
        };
        let toast = match now {
            UpdaterState::Idle | UpdaterState::Checking => return,
            UpdaterState::UpToDate => Some(OwnToast::UpToDate),
            UpdaterState::Failed { .. } => Some(OwnToast::UpdateCheckFailed),
            _ => None,
        };
        self.asked.take();
        let Some(window) = state.windows.get(id).or_else(|| state.windows.front()) else {
            return;
        };
        match toast {
            Some(toast) => {
                if let Some(browser) = window.browser() {
                    let _ = ipc::show_toast(&browser, toast);
                }
            }
            None => {
                self.shown.set(true);
                ipc::send_open_update(&window);
            }
        }
    }
}

fn options(settings: &Settings) -> UpdaterOptions {
    UpdaterOptions {
        automatic: settings.automatic_updates,
        beta: settings.beta_updates,
    }
}

// The updater's `changed`.
fn changed(state: &Weak<State>, now: &UpdaterState) {
    if let (Some(state), Some(mt)) = (state.upgrade(), MainThread::get()) {
        state.updates.update(&state, mt, now);
    }
}

// Tells Chromium's About page. It has no line for an update found and not
// downloaded, which the card offers: About shows none until it downloads,
// and asks for no check meanwhile.
fn set_about(mt: MainThread, now: &UpdaterState) {
    let about = match now {
        UpdaterState::Idle | UpdaterState::Checking => UpdateState::new(UpdateStatus::Checking),
        UpdaterState::Available { .. } => UpdateState::new(UpdateStatus::None),
        UpdaterState::Downloading { progress, .. } => UpdateState {
            progress: progress.map_or(-1, |progress| (progress * 100.0).round() as i32),
            ..UpdateState::new(UpdateStatus::Downloading)
        },
        UpdaterState::Ready { version } => UpdateState {
            version: Some(version.clone()),
            ..UpdateState::new(UpdateStatus::Ready)
        },
        UpdaterState::UpToDate => UpdateState::new(UpdateStatus::UpToDate),
        UpdaterState::Failed { message } => UpdateState {
            message: Some(message.clone()),
            ..UpdateState::new(UpdateStatus::Failed)
        },
    };
    if let Err(error) = mt.set_update_state(&about) {
        eprintln!("Wren could not tell About of its update: {error:?}");
    }
}
