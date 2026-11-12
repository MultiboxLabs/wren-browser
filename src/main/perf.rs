// The sidebar's performance run (scripts/perf.ts). The script names a file
// of its settings in WREN_PERF; the page reads them, runs its scenarios
// against the sidebar (src/renderer/perf/), and reports here, one JSON line
// at a time, to the file the settings name. Only a Dev build takes it.
// During a run, each window counts what its page is sent (`PageCounts`), so
// the page measures the channel without doing the work itself.

use std::cell::RefCell;
use std::fs::{self, OpenOptions};
use std::io::{self, Write};
use std::path::PathBuf;

use serde::Serialize;
use serde_json::Value;

use crate::channel::Channel;

pub struct Perf {
    /// The script's settings, as the page reads them.
    pub config: Value,
    output: PathBuf,
}

impl Perf {
    /// The data folder of a run, in place of the channel's: a run opens
    /// hundreds of tabs, which the user's session must not restore. The
    /// script clears it before each run (as `dataFolder` there).
    pub const DATA_FOLDER: &str = "Wren Perf";

    /// The run WREN_PERF asks for, if it does and this is a Dev build.
    pub fn from_env(channel: Channel) -> Option<Perf> {
        if !matches!(channel, Channel::Dev) {
            return None;
        }
        let path = std::env::var_os("WREN_PERF")?;
        let config: Value = match fs::read(&path).map(|bytes| serde_json::from_slice(&bytes)) {
            Ok(Ok(config)) => config,
            _ => {
                eprintln!("Wren could not read the performance run's settings.");
                return None;
            }
        };
        let output = PathBuf::from(config.get("output")?.as_str()?);
        Some(Perf { config, output })
    }

    /// Chromium switches for a run in the background, behind the user's
    /// windows: Chromium stops drawing a page whose window is covered, and
    /// slows its timers, and the run's page must go on as if it were seen.
    pub fn development_switches(&self) -> Vec<String> {
        if self.config.get("background").and_then(Value::as_bool) != Some(true) {
            return Vec::new();
        }
        vec![
            "--disable-backgrounding-occluded-windows".into(),
            "--disable-renderer-backgrounding".into(),
            "--disable-background-timer-throttling".into(),
        ]
    }

    /// Adds one of the page's reports to the output, on a line of its own.
    pub fn record(&self, entry: &Value) -> io::Result<()> {
        let mut file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&self.output)?;
        writeln!(file, "{entry}")
    }
}

/// What a window's page has been sent of its tabs during a run, which the
/// page reads and clears ("perf.counts").
#[derive(Default)]
pub struct PageCounts(RefCell<Counts>);

#[derive(Default, Serialize)]
pub struct Counts {
    /// The length of each message of tabs, in bytes of JSON.
    bytes: Vec<usize>,
    /// How many batches of Chromium's changes sent the page any.
    batches: u32,
}

impl PageCounts {
    /// A message of tabs went to the page, of `bytes`.
    pub fn sent(&self, bytes: usize) {
        self.0.borrow_mut().bytes.push(bytes);
    }

    /// How many messages of tabs have gone since the last `take`.
    pub fn messages(&self) -> usize {
        self.0.borrow().bytes.len()
    }

    /// A batch of changes is done: it counts if the page has been sent
    /// more than `before` messages since it started.
    pub fn batch_done(&self, before: usize) {
        let mut counts = self.0.borrow_mut();
        if counts.bytes.len() > before {
            counts.batches += 1;
        }
    }

    /// The counts so far, starting again from none.
    pub fn take(&self) -> Counts {
        self.0.take()
    }
}
