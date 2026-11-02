// Safari's history: its `History.db`, a page in `history_items` and each
// visit in `history_visits`, which has the title the page had then.

use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::Connection;
use wren::HistoryEntry;

use super::unix_ms;
use crate::import::data::is_page;
use crate::import::snapshot::Snapshot;
use crate::import::source::ReadError;

const BATCH: usize = 5_000;

pub fn read(folder: &Path, batch: &mut dyn FnMut(Vec<HistoryEntry>)) -> Result<(), ReadError> {
    let snapshot = Snapshot::of(&folder.join("History.db"))?;
    // Each page with its last visit, and the title it had then.
    let mut query = snapshot.db.prepare(
        "SELECT i.url, i.visit_count, v.visit_time, v.title FROM history_items i \
         JOIN history_visits v ON v.id = \
           (SELECT id FROM history_visits WHERE history_item = i.id ORDER BY visit_time DESC LIMIT 1)",
    )?;
    let mut rows = query.query([])?;
    let mut entries = Vec::with_capacity(BATCH);
    while let Some(row) = rows.next()? {
        let url: String = row.get(0)?;
        if !is_page(&url) {
            continue;
        }
        let title: Option<String> = row.get(3)?;
        entries.push(HistoryEntry {
            url,
            title: title.filter(|title| !title.is_empty()),
            visit_count: row.get(1)?,
            typed_count: 0,
            last_visit_ms: unix_ms(row.get(2)?),
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

pub fn count(db: &Connection) -> Result<usize, ReadError> {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0.0, |since| since.as_secs_f64());
    let since = now - 978_307_200.0 - 90.0 * 24.0 * 60.0 * 60.0;
    let count: i64 = db.query_row(
        "SELECT COUNT(DISTINCT history_item) FROM history_visits WHERE visit_time > ?1",
        [since],
        |row| row.get(0),
    )?;
    Ok(count as usize)
}
