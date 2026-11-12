// A Chromium profile's cookies: its `Cookies` file, each value encrypted
// with the browser's key, which the platform keeps (platform::secrets) and
// asks the user for. Since the file's version 24, a value starts with a hash
// of its host, which goes.

use std::path::{Path, PathBuf};
use std::time::SystemTime;

use rusqlite::types::ValueRef;
use rusqlite::{Connection, Row};
use wren::Cookie;

use super::{KeyItem, chromium_time, unix_ms};
use crate::import::engines::same_site;
use crate::import::snapshot::{self, Snapshot};
use crate::import::source::{COOKIE_BATCH, ReadError};
use crate::platform;

/// Where its cookies are: in `Network/` since Chromium 96, or beside the
/// rest before.
pub fn path(profile: &Path) -> PathBuf {
    let network = profile.join("Network/Cookies");
    if network.is_file() {
        network
    } else {
        profile.join("Cookies")
    }
}

/// How many sites have cookies, read with no key, so the user is asked for
/// it only once they bring them over.
pub fn count(db: &Connection) -> Result<usize, ReadError> {
    let sql = format!(
        "SELECT COUNT(DISTINCT host_key) FROM cookies WHERE {}",
        live()
    );
    snapshot::count(db, &sql, [])
}

// The cookies that have not expired: a session cookie, or one whose expiry
// is still to come. Chromium keeps an expired one until it next reads it.
fn live() -> String {
    let now = chromium_time(SystemTime::now());
    format!("(is_persistent = 0 OR expires_utc > {now})")
}

pub fn read(
    item: &KeyItem,
    root: &Path,
    profile: &Path,
    batch: &mut dyn FnMut(Vec<Cookie>),
) -> Result<(), ReadError> {
    let snapshot = Snapshot::of(&path(profile))?;
    let db = &snapshot.db;
    let version: i64 = db
        .query_row("SELECT value FROM meta WHERE key = 'version'", [], |row| {
            row.get::<_, String>(0)
        })
        .ok()
        .and_then(|version| version.parse().ok())
        .unwrap_or(0);
    let hashed = version >= 24;
    let columns = columns(db)?;
    let has = |name: &str| columns.iter().any(|column| column == name);
    let key = platform::chromium_key(item.service, item.account, root)
        .map_err(ReadError::Unreadable)?
        .ok_or(ReadError::Refused)?;
    let query = format!(
        "SELECT host_key, name, value, encrypted_value, path, creation_utc, expires_utc, last_access_utc, \
         is_secure, is_httponly, samesite, is_persistent, {}, {} FROM cookies WHERE {}",
        if has("top_frame_site_key") {
            "top_frame_site_key"
        } else {
            "''"
        },
        if has("has_cross_site_ancestor") {
            "has_cross_site_ancestor"
        } else {
            "0"
        },
        live(),
    );
    snapshot.read_in_batches(&query, COOKIE_BATCH, batch, |row| {
        let plain = String::from_utf8_lossy(bytes(row, 2)?).into_owned();
        let value = if plain.is_empty() {
            let sealed = bytes(row, 3)?;
            if sealed.is_empty() {
                Some(String::new())
            } else {
                platform::decrypt(&key, sealed).and_then(|opened| {
                    // Since the file's version 24, a hash of its host first.
                    let opened = match opened.get(32..) {
                        Some(value) if hashed => value.to_vec(),
                        _ => opened,
                    };
                    String::from_utf8(opened).ok()
                })
            }
        } else {
            Some(plain)
        };
        // One that does not open is left out.
        let Some(value) = value else { return Ok(None) };
        let persistent: bool = row.get(11)?;
        let partition: String = row.get(12)?;
        Ok(Some(Cookie {
            domain: row.get(0)?,
            name: row.get(1)?,
            value,
            path: row.get(4)?,
            created_ms: unix_ms(row.get(5)?),
            expires_ms: if persistent { unix_ms(row.get(6)?) } else { 0 },
            last_access_ms: unix_ms(row.get(7)?),
            secure: row.get(8)?,
            http_only: row.get(9)?,
            same_site: same_site(row.get(10)?),
            partition_site: (!partition.is_empty()).then_some(partition),
            partition_cross_site_ancestor: row.get(13)?,
        }))
    })
}

// A column's bytes, which some browsers keep as text and others as a blob,
// even in one file; none for NULL.
fn bytes<'row>(row: &'row Row, index: usize) -> rusqlite::Result<&'row [u8]> {
    Ok(match row.get_ref(index)? {
        ValueRef::Text(bytes) | ValueRef::Blob(bytes) => bytes,
        _ => &[],
    })
}

fn columns(db: &Connection) -> Result<Vec<String>, ReadError> {
    let mut query = db.prepare("SELECT name FROM pragma_table_info('cookies')")?;
    let names = query
        .query_map([], |row| row.get(0))?
        .collect::<Result<_, _>>()?;
    Ok(names)
}

#[cfg(test)]
mod tests {
    use super::*;

    // Some browsers keep a value as text in a blob column.
    #[test]
    fn reads_a_value_kept_as_text_or_a_blob() {
        let db = Connection::open_in_memory().unwrap();
        let read = |sql: &str| -> Vec<u8> {
            db.query_row(sql, [], |row| bytes(row, 0).map(<[u8]>::to_vec))
                .unwrap()
        };
        assert_eq!(read("SELECT CAST('v10' AS BLOB)"), b"v10");
        assert_eq!(read("SELECT 'v10'"), b"v10");
        assert_eq!(read("SELECT NULL"), b"");
    }
}
