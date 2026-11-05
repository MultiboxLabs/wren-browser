// A source's SQLite file, to read while the source may have it open: copied,
// with its write-ahead log and journal, to a folder of its own in the
// system's temporary folder, and opened read-only there. The folder goes
// when the snapshot does.

use std::fs;
use std::path::{Path, PathBuf};

use rusqlite::{Connection, OpenFlags, Params, Row};

use super::source::ReadError;

pub struct Snapshot {
    folder: PathBuf,
    pub db: Connection,
}

impl Snapshot {
    pub fn of(path: &Path) -> Result<Snapshot, ReadError> {
        existing(path)?;
        let mut name = [0u8; 8];
        getrandom::fill(&mut name).map_err(|error| ReadError::Unreadable(error.to_string()))?;
        let hex: String = name.iter().map(|byte| format!("{byte:02x}")).collect();
        let folder = std::env::temp_dir().join(format!("wren-import-{hex}"));
        fs::create_dir(&folder)?;
        let copy = folder.join("db");
        let copied = (|| {
            fs::copy(path, &copy)?;
            for suffix in ["-wal", "-journal"] {
                let beside = PathBuf::from(format!("{}{suffix}", path.display()));
                if beside.is_file() {
                    fs::copy(&beside, folder.join(format!("db{suffix}")))?;
                }
            }
            Ok::<_, std::io::Error>(())
        })();
        if let Err(error) = copied {
            let _ = fs::remove_dir_all(&folder);
            return Err(error.into());
        }
        // Not read-only: SQLite brings the copied log into the copy as it
        // opens it, which is a write, of the copy alone.
        let db = Connection::open_with_flags(&copy, OpenFlags::SQLITE_OPEN_READ_WRITE)
            .map_err(ReadError::from)
            .inspect_err(|_| {
                let _ = fs::remove_dir_all(&folder);
            })?;
        Ok(Snapshot { folder, db })
    }

    /// Each row `sql` selects, as `each` makes it (none for a row it leaves
    /// out), handed to `batch` `size` at a time.
    pub fn read_in_batches<T>(
        &self,
        sql: &str,
        size: usize,
        batch: &mut dyn FnMut(Vec<T>),
        mut each: impl FnMut(&Row) -> rusqlite::Result<Option<T>>,
    ) -> Result<(), ReadError> {
        let mut query = self.db.prepare(sql)?;
        let mut rows = query.query([])?;
        let mut items = Vec::with_capacity(size);
        while let Some(row) = rows.next()? {
            items.extend(each(row)?);
            if items.len() == size {
                batch(std::mem::replace(&mut items, Vec::with_capacity(size)));
            }
        }
        if !items.is_empty() {
            batch(items);
        }
        Ok(())
    }
}

impl Drop for Snapshot {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.folder);
    }
}

/// `path` opened as it is, for a count: never written, and with no lock
/// taken, so what the source is writing now may be left out of it.
pub fn glance(path: &Path) -> Result<Connection, ReadError> {
    existing(path)?;
    let encoded: String = path
        .to_string_lossy()
        .chars()
        .map(|char| match char {
            '%' => "%25".to_owned(),
            '?' => "%3f".to_owned(),
            '#' => "%23".to_owned(),
            ' ' => "%20".to_owned(),
            char => char.to_string(),
        })
        .collect();
    Ok(Connection::open_with_flags(
        format!("file:{encoded}?immutable=1"),
        OpenFlags::SQLITE_OPEN_READ_ONLY | OpenFlags::SQLITE_OPEN_URI,
    )?)
}

/// The count `sql` selects, of its first column.
pub fn count(db: &Connection, sql: &str, params: impl Params) -> Result<usize, ReadError> {
    let count: i64 = db.query_row(sql, params, |row| row.get(0))?;
    Ok(count.max(0) as usize)
}

// That the file at `path` is there to read. A file macOS keeps from Wren
// reads as missing to `is_file`, but fails to open as denied: try it, to
// tell the two apart.
fn existing(path: &Path) -> Result<(), ReadError> {
    if path.is_file() {
        return Ok(());
    }
    fs::File::open(path)?;
    Err(ReadError::Missing)
}
