// The app's own updates, by the platform's updater (Sparkle on macOS). It
// checks on a schedule of its own and draws nothing of its own: what it is
// doing is an `UpdaterState`, which the app shows (updates.rs).

use wren::MainThread;

use super::current;

/// What the updater is doing.
#[derive(Clone, Debug, PartialEq)]
pub enum UpdaterState {
    /// Nothing yet.
    Idle,
    Checking,
    /// Found, to download once `download` is called: Automatic Updates is
    /// off.
    Available {
        version: String,
    },
    /// Downloading, or unpacking, with how far it is from 0 to 1 if known.
    Downloading {
        version: String,
        progress: Option<f32>,
    },
    /// Downloaded: installed as the app quits, or by
    /// `install_and_relaunch`.
    Ready {
        version: String,
    },
    UpToDate,
    /// The check or the download failed, with what went wrong.
    Failed {
        message: String,
    },
}

/// What the user chose in Settings.
#[derive(Clone, Copy, Debug)]
pub struct UpdaterOptions {
    /// Downloads what it finds, without asking.
    pub automatic: bool,
    /// Takes beta versions too.
    pub beta: bool,
}

pub struct Updater(current::updater::Updater);

impl Updater {
    /// The updater, started, or none if the app has no feed or the
    /// platform's updater is missing. `changed` hears each new state, and is
    /// never called from inside a call to the updater.
    pub fn start(
        mt: MainThread,
        options: UpdaterOptions,
        changed: Box<dyn Fn(&UpdaterState)>,
    ) -> Option<Updater> {
        current::updater::Updater::start(mt, options, changed).map(Updater)
    }

    pub fn state(&self) -> UpdaterState {
        self.0.state()
    }

    pub fn set_options(&self, options: UpdaterOptions) {
        self.0.set_options(options);
    }

    /// Checks for an update, unless it is busy or one waits. `asked`: the
    /// user asked, by Check for Updates….
    pub fn check(&self, asked: bool) {
        self.0.check(asked);
    }

    /// Downloads the update found (`UpdaterState::Available`).
    pub fn download(&self) {
        self.0.download();
    }

    /// Installs the update that is ready, and launches the app again once it
    /// has quit. Only as the app quits to relaunch (`App::quit_committed`),
    /// once the relaunch is the app's. False if no update is ready.
    pub fn install_and_relaunch(&self) -> bool {
        self.0.install_and_relaunch()
    }
}
