// A source's SQLite file, to read while the source may have it open: copied,
// with its write-ahead log and journal, to a folder of its own in the
// system's temporary folder, and opened read-only there. The folder goes
// when the snapshot does.

use std::fs;
use std::path::{Path, PathBuf};

use rusqlite::{Connection, OpenFlags};

use super::source::ReadError;

pub struct Snapshot {
    folder: PathBuf,
    pub db: Connection,
}

impl Snapshot {
    pub fn of(path: &Path) -> Result<Snapshot, ReadError> {
        if !path.is_file() {
            // A file macOS keeps from Wren reads as missing to is_file, but
            // fails to open as denied: try it, to tell the two apart.
            fs::File::open(path)?;
            return Err(ReadError::Missing);
        }
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
}

impl Drop for Snapshot {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.folder);
    }
}

/// `path` opened as it is, for a count: never written, and with no lock
/// taken, so what the source is writing now may be left out of it.
pub fn glance(path: &Path) -> Result<Connection, ReadError> {
    if !path.is_file() {
        fs::File::open(path)?;
        return Err(ReadError::Missing);
    }
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
