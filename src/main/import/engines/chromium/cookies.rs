// A Chromium profile's cookies: its `Cookies` file, each value encrypted
// with the browser's key, which the platform keeps (platform::secrets) and
// asks the user for. Since the file's version 24, a value starts with a hash
// of its host, which goes.

use std::path::{Path, PathBuf};

use rusqlite::Connection;
use wren::{Cookie, CookieSameSite};

use super::{KeyItem, unix_ms};
use crate::import::snapshot::Snapshot;
use crate::import::source::ReadError;
use crate::platform;

/// How many cookies are handed over at once.
const BATCH: usize = 1_000;

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
    let count: i64 = db.query_row("SELECT COUNT(DISTINCT host_key) FROM cookies", [], |row| {
        row.get(0)
    })?;
    Ok(count as usize)
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
         is_secure, is_httponly, samesite, is_persistent, {}, {} FROM cookies",
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
    );
    let mut query = db.prepare(&query)?;
    let mut rows = query.query([])?;
    let mut cookies = Vec::with_capacity(BATCH);
    while let Some(row) = rows.next()? {
        let plain: String = row.get(2)?;
        let value = if plain.is_empty() {
            let sealed: Vec<u8> = row.get(3)?;
            if sealed.is_empty() {
                Some(String::new())
            } else {
                platform::decrypt(&key, &sealed).and_then(|opened| {
                    let opened = if hashed && opened.len() >= 32 {
                        opened[32..].to_vec()
                    } else {
                        opened
                    };
                    String::from_utf8(opened).ok()
                })
            }
        } else {
            Some(plain)
        };
        // One that does not open is left out.
        let Some(value) = value else { continue };
        let persistent: bool = row.get(11)?;
        let partition: String = row.get(12)?;
        cookies.push(Cookie {
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
        });
        if cookies.len() == BATCH {
            batch(std::mem::replace(&mut cookies, Vec::with_capacity(BATCH)));
        }
    }
    if !cookies.is_empty() {
        batch(cookies);
    }
    Ok(())
}

fn columns(db: &Connection) -> Result<Vec<String>, ReadError> {
    let mut query = db.prepare("SELECT name FROM pragma_table_info('cookies')")?;
    let names = query
        .query_map([], |row| row.get(0))?
        .collect::<Result<_, _>>()?;
    Ok(names)
}

/// Chromium's `samesite`: -1 unspecified, 0 none, 1 lax, 2 strict.
fn same_site(value: i64) -> CookieSameSite {
    match value {
        0 => CookieSameSite::None,
        1 => CookieSameSite::Lax,
        2 => CookieSameSite::Strict,
        _ => CookieSameSite::Unspecified,
    }
}
