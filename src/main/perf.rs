// The sidebar's performance run (scripts/perf.ts). The script names a file
// of its settings in WREN_PERF; the page reads them, runs its scenarios
// against the sidebar (src/renderer/perf/), and reports here, one JSON line
// at a time, to the file the settings name. Only a Dev build takes it.

use std::fs::{self, OpenOptions};
use std::io::{self, Write};
use std::path::PathBuf;

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

    /// Adds one of the page's reports to the output, on a line of its own.
    pub fn record(&self, entry: &Value) -> io::Result<()> {
        let mut file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&self.output)?;
        writeln!(file, "{entry}")
    }
}
