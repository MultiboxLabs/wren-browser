// A Chromium profile's history: its `History` file's `urls`, those it does
// not hide.

use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::Connection;
use wren::HistoryEntry;

use super::unix_ms;
use crate::import::snapshot::Snapshot;
use crate::import::source::ReadError;

/// How many entries are handed over at once.
const BATCH: usize = 5_000;

pub fn read(profile: &Path, batch: &mut dyn FnMut(Vec<HistoryEntry>)) -> Result<(), ReadError> {
    let snapshot = Snapshot::of(&profile.join("History"))?;
    let mut query = snapshot.db.prepare(
        "SELECT url, title, visit_count, typed_count, last_visit_time FROM urls WHERE hidden = 0",
    )?;
    let mut rows = query.query([])?;
    let mut entries = Vec::with_capacity(BATCH);
    while let Some(row) = rows.next()? {
        let title: Option<String> = row.get(1)?;
        entries.push(HistoryEntry {
            url: row.get(0)?,
            title: title.filter(|title| !title.is_empty()),
            visit_count: row.get(2)?,
            typed_count: row.get(3)?,
            last_visit_ms: unix_ms(row.get(4)?),
        });
        if entries.len() == BATCH {
            batch(std::mem::replace(&mut entries, Vec::with_capacity(BATCH)));
        }
    }
    if !entries.is_empty() {
        batch(entries);
    }
    Ok(())
}

/// How many pages were visited in the past 90 days, which is all Wren keeps.
pub fn count(db: &Connection) -> Result<usize, ReadError> {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |since| since.as_micros() as i64);
    // In Chromium's time: microseconds since 1601.
    let since = now + 11_644_473_600_000_000 - 90 * 24 * 60 * 60 * 1_000_000;
    let count: i64 = db.query_row(
        "SELECT COUNT(*) FROM urls WHERE hidden = 0 AND last_visit_time > ?1",
        [since],
        |row| row.get(0),
    )?;
    Ok(count as usize)
}

#[cfg(test)]
mod tests {
    use super::super::unix_ms;

    #[test]
    fn chromium_time_is_from_1601() {
        // 2024-01-01T00:00:00Z.
        assert_eq!(unix_ms(13_348_540_800_000_000), 1_704_067_200_000);
        assert_eq!(unix_ms(0), 0);
    }
}
