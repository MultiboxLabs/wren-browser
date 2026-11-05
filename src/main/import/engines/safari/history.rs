// Safari's history: its `History.db`, a page in `history_items` and each
// visit in `history_visits`, which has the title the page had then.

use std::path::Path;

use rusqlite::Connection;
use wren::HistoryEntry;

use super::{apple_time, unix_ms};
use crate::import::data::is_page;
use crate::import::snapshot::{self, Snapshot};
use crate::import::source::{HISTORY_BATCH, ReadError, history_kept_since};

pub fn read(folder: &Path, batch: &mut dyn FnMut(Vec<HistoryEntry>)) -> Result<(), ReadError> {
    // Each page with its last visit, and the title it had then.
    Snapshot::of(&folder.join("History.db"))?.read_in_batches(
        "SELECT i.url, i.visit_count, v.visit_time, v.title FROM history_items i \
         JOIN history_visits v ON v.id = \
           (SELECT id FROM history_visits WHERE history_item = i.id ORDER BY visit_time DESC LIMIT 1)",
        HISTORY_BATCH,
        batch,
        |row| {
            let url: String = row.get(0)?;
            if !is_page(&url) {
                return Ok(None);
            }
            let title: Option<String> = row.get(3)?;
            Ok(Some(HistoryEntry {
                url,
                title: title.filter(|title| !title.is_empty()),
                visit_count: row.get(1)?,
                typed_count: 0,
                last_visit_ms: unix_ms(row.get(2)?),
            }))
        },
    )
}

/// How many pages were visited in the time Wren keeps.
pub fn count(db: &Connection) -> Result<usize, ReadError> {
    snapshot::count(
        db,
        "SELECT COUNT(DISTINCT history_item) FROM history_visits WHERE visit_time > ?1",
        [apple_time(history_kept_since())],
    )
}
