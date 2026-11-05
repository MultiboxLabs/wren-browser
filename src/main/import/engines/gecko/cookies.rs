// A Gecko profile's cookies: its `cookies.sqlite`, in plain text. Those of a
// container are left out, as Wren has none; a partitioned one keeps its
// top-level site, from its origin attributes.

use std::path::Path;

use rusqlite::Connection;
use wren::Cookie;

use crate::import::engines::same_site;
use crate::import::snapshot::{self, Snapshot};
use crate::import::source::{COOKIE_BATCH, ReadError};

pub fn count(db: &Connection) -> Result<usize, ReadError> {
    snapshot::count(
        db,
        "SELECT COUNT(DISTINCT host) FROM moz_cookies WHERE originAttributes NOT LIKE '%userContextId=%'",
        [],
    )
}

pub fn read(profile: &Path, batch: &mut dyn FnMut(Vec<Cookie>)) -> Result<(), ReadError> {
    Snapshot::of(&profile.join("cookies.sqlite"))?.read_in_batches(
        "SELECT host, name, value, path, expiry, lastAccessed, creationTime, isSecure, isHttpOnly, \
         sameSite, originAttributes FROM moz_cookies",
        COOKIE_BATCH,
        batch,
        |row| {
            let attributes: String = row.get(10)?;
            if attributes.contains("userContextId=") {
                return Ok(None);
            }
            Ok(Some(Cookie {
                domain: row.get(0)?,
                name: row.get(1)?,
                value: row.get(2)?,
                path: row.get(3)?,
                expires_ms: expiry_ms(row.get(4)?),
                last_access_ms: row.get::<_, i64>(5)? / 1000,
                created_ms: row.get::<_, i64>(6)? / 1000,
                secure: row.get(7)?,
                http_only: row.get(8)?,
                same_site: same_site(row.get(9)?),
                partition_site: partition_site(&attributes),
                partition_cross_site_ancestor: false,
            }))
        },
    )
}

/// Its expiry, in seconds in older versions and milliseconds in newer ones,
/// as milliseconds: no expiry in seconds is past the year 5000.
fn expiry_ms(expiry: i64) -> i64 {
    if expiry > 100_000_000_000 {
        expiry
    } else {
        expiry * 1000
    }
}

/// The top-level site of a partitioned cookie, from its origin attributes:
/// `^partitionKey=%28https%2Cexample.com%29` is `https://example.com`.
pub fn partition_site(attributes: &str) -> Option<String> {
    let key = attributes
        .split(['^', '&'])
        .find_map(|part| part.strip_prefix("partitionKey="))?;
    let key = decode(key);
    let inner = key.strip_prefix('(')?.strip_suffix(')')?;
    let mut parts = inner.split(',');
    let scheme = parts.next()?;
    let host = parts.next()?;
    Some(format!("{scheme}://{host}"))
}

fn decode(text: &str) -> String {
    let bytes = text.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut at = 0;
    while at < bytes.len() {
        if bytes[at] == b'%'
            && let Some(byte) = text
                .get(at + 1..at + 3)
                .and_then(|hex| u8::from_str_radix(hex, 16).ok())
        {
            out.push(byte);
            at += 3;
        } else {
            out.push(bytes[at]);
            at += 1;
        }
    }
    String::from_utf8_lossy(&out).into_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_the_partition_and_the_expiry() {
        assert_eq!(
            partition_site("^partitionKey=%28https%2Cexample.com%29").as_deref(),
            Some("https://example.com")
        );
        assert_eq!(partition_site("^privateBrowsingId=1"), None);
        assert_eq!(expiry_ms(1_800_000_000), 1_800_000_000_000);
        assert_eq!(expiry_ms(1_800_000_000_000), 1_800_000_000_000);
    }
}
