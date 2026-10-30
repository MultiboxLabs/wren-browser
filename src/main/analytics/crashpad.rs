// The crashes Chromium's Crashpad caught: a minidump for each, in `Crashpad`
// in the data folder, which nothing uploads. Analytics counts those written
// since the last it counted, from when each was written; what is in them is
// never read or sent. The browser's, the GPU's and a renderer's crashes are
// all among them, and are not told apart.

use std::fs;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

/// When each minidump in `data`'s Crashpad folder was written.
pub fn reports(data: &Path) -> Vec<SystemTime> {
    let crashpad = data.join("Crashpad");
    ["pending", "completed"]
        .iter()
        .filter_map(|folder| fs::read_dir(crashpad.join(folder)).ok())
        .flatten()
        .flatten()
        .filter(|entry| entry.path().extension().is_some_and(|ext| ext == "dmp"))
        .filter_map(|entry| entry.metadata().ok()?.modified().ok())
        .collect()
}

/// Of `reports`, those written after `last` (milliseconds since the epoch),
/// and the last to count from next. With no `last`, at the first run, none
/// are new: those already there are from before analytics.
pub fn new_since(reports: &[SystemTime], last: Option<u64>) -> (Vec<SystemTime>, Option<u64>) {
    let millis = |time: &SystemTime| {
        time.duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64
    };
    let latest = reports.iter().map(millis).max();
    let Some(last) = last else {
        return (Vec::new(), latest.or(Some(0)));
    };
    let new = reports
        .iter()
        .filter(|time| millis(time) > last)
        .copied()
        .collect();
    (new, latest.max(Some(last)))
}

#[cfg(test)]
mod tests {
    use std::time::Duration;

    use super::*;

    fn time(millis: u64) -> SystemTime {
        UNIX_EPOCH + Duration::from_millis(millis)
    }

    #[test]
    fn counts_only_what_is_new_after_the_first_run() {
        let reports = [time(10), time(20)];
        // The first run counts from the latest already there.
        assert_eq!(new_since(&reports, None), (Vec::new(), Some(20)));
        assert_eq!(new_since(&[], None), (Vec::new(), Some(0)));
        assert_eq!(new_since(&reports, Some(20)), (Vec::new(), Some(20)));
        let reports = [time(10), time(20), time(30), time(40)];
        assert_eq!(
            new_since(&reports, Some(20)),
            (vec![time(30), time(40)], Some(40))
        );
        // Ones cleared away leave the mark where it was.
        assert_eq!(new_since(&[], Some(40)), (Vec::new(), Some(40)));
    }

    #[test]
    fn reads_the_minidumps_alone() {
        let data = std::env::temp_dir().join(format!("wren-crashpad-{}", std::process::id()));
        let pending = data.join("Crashpad/pending");
        fs::create_dir_all(&pending).unwrap();
        fs::write(pending.join("a.dmp"), b"").unwrap();
        fs::write(pending.join("a.meta"), b"").unwrap();
        assert_eq!(reports(&data).len(), 1);
        fs::remove_dir_all(&data).unwrap();
        assert!(reports(&data).is_empty());
    }
}
