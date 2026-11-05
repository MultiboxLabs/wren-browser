// A Chromium profile's history: its `History` file's `urls`, those it does
// not hide.

use std::path::Path;

use rusqlite::Connection;
use wren::HistoryEntry;

use super::{chromium_time, unix_ms};
use crate::import::snapshot::{self, Snapshot};
use crate::import::source::{HISTORY_BATCH, ReadError, history_kept_since};

pub fn read(profile: &Path, batch: &mut dyn FnMut(Vec<HistoryEntry>)) -> Result<(), ReadError> {
    Snapshot::of(&profile.join("History"))?.read_in_batches(
        "SELECT url, title, visit_count, typed_count, last_visit_time FROM urls WHERE hidden = 0",
        HISTORY_BATCH,
        batch,
        |row| {
            let title: Option<String> = row.get(1)?;
            Ok(Some(HistoryEntry {
                url: row.get(0)?,
                title: title.filter(|title| !title.is_empty()),
                visit_count: row.get(2)?,
                typed_count: row.get(3)?,
                last_visit_ms: unix_ms(row.get(4)?),
            }))
        },
    )
}

/// How many pages were visited in the time Wren keeps.
pub fn count(db: &Connection) -> Result<usize, ReadError> {
    snapshot::count(
        db,
        "SELECT COUNT(*) FROM urls WHERE hidden = 0 AND last_visit_time > ?1",
        [chromium_time(history_kept_since())],
    )
}

#[cfg(test)]
mod tests {
    use std::time::{Duration, UNIX_EPOCH};

    use super::super::{chromium_time, unix_ms};

    #[test]
    fn chromium_time_is_from_1601() {
        // 2024-01-01T00:00:00Z.
        assert_eq!(unix_ms(13_348_540_800_000_000), 1_704_067_200_000);
        assert_eq!(unix_ms(0), 0);
        let new_year = UNIX_EPOCH + Duration::from_millis(1_704_067_200_000);
        assert_eq!(chromium_time(new_year), 13_348_540_800_000_000);
    }
}
