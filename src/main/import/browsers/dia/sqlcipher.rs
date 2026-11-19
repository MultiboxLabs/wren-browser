// A SQLCipher 4 database, as Dia keeps its own: SQLCipher's defaults, with
// a raw 32-byte key. Each 4096-byte page is encrypted with AES-256-CBC, and
// its last 80 bytes are the page's IV and an HMAC-SHA512 of it, keyed with
// PBKDF2 of the key and a salt. The salt is the first 16 bytes of the file,
// where SQLite's header would be. A source writes to its write-ahead log
// first, so the frames committed to it are laid over the file's pages
// before any is decrypted. What comes out is plain SQLite, opened in
// memory, so none of it is ever written to disk.

use std::collections::HashMap;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use rusqlite::{Connection, MAIN_DB};

use crate::import::source::ReadError;
use crate::platform::{self, Hash};

const PAGE: usize = 4096;
/// What each page keeps after its ciphertext: its IV, then its HMAC.
const RESERVED: usize = IV + TAG;
const IV: usize = 16;
const TAG: usize = 64;
/// The first page's salt, where SQLite's header starts.
const SALT: usize = 16;
/// How SQLCipher makes the HMAC's key from the database's: PBKDF2 with
/// HMAC-SHA512, of the salt with each byte masked.
const HMAC_SALT_MASK: u8 = 0x3a;
const HMAC_KEY_ROUNDS: u32 = 2;
/// What the salt stands in for, at the start of the plain file.
const SQLITE_HEADER: &[u8; SALT] = b"SQLite format 3\0";

/// The database at `path`, decrypted with `key` and opened read-only in
/// memory. It is unreadable if `key` does not open it, or a page of it is
/// damaged.
pub fn open(path: &Path, key: &[u8]) -> Result<Connection, ReadError> {
    // Read before the file: a checkpoint between the two reads lays what the
    // log held over the file, so reading the log first misses none of it.
    let log = match fs::read(PathBuf::from(format!("{}-wal", path.display()))) {
        Ok(log) => log,
        Err(error) if error.kind() == io::ErrorKind::NotFound => Vec::new(),
        Err(error) => return Err(error.into()),
    };
    let file = fs::read(path)?;
    let plain = decrypt(&file, &log, key)?;
    let mut db = Connection::open_in_memory()?;
    db.deserialize_read_exact(MAIN_DB, &plain[..], plain.len(), true)?;
    Ok(db)
}

fn unreadable(why: &str) -> ReadError {
    ReadError::Unreadable(why.into())
}

// The plain database that `file` and its log `log` make, decrypted with
// `key`.
fn decrypt(file: &[u8], log: &[u8], key: &[u8]) -> Result<Vec<u8>, ReadError> {
    if file.len() < PAGE || !file.len().is_multiple_of(PAGE) {
        return Err(unreadable("it is not a database"));
    }
    let (logged, pages) = committed(log).unwrap_or_else(|| (HashMap::new(), file.len() / PAGE));
    let hmac_key = hmac_key(key, &file[..SALT]).ok_or(unreadable("its key could not be made"))?;
    let mut plain = Vec::with_capacity(pages * PAGE);
    for number in 1..=pages {
        let page = match logged.get(&number) {
            Some(page) => *page,
            None => file
                .get((number - 1) * PAGE..number * PAGE)
                .ok_or(unreadable("pages of it are missing"))?,
        };
        let page = decrypt_page(page, number, key, &hmac_key).ok_or_else(|| {
            unreadable(if number == 1 {
                "its key does not open it"
            } else {
                "a page of it is damaged"
            })
        })?;
        plain.extend(page);
    }
    // Its header says its log is a write-ahead log, which a database in
    // memory has none of: say it has a journal, as SQLite opens it then.
    plain[18] = 1;
    plain[19] = 1;
    Ok(plain)
}

fn hmac_key(key: &[u8], salt: &[u8]) -> Option<Vec<u8>> {
    let salt: Vec<u8> = salt.iter().map(|byte| byte ^ HMAC_SALT_MASK).collect();
    platform::pbkdf2(Hash::Sha512, key, &salt, HMAC_KEY_ROUNDS, key.len())
}

// Page `number` decrypted, if its HMAC says `key` opens it as it was
// written.
fn decrypt_page(page: &[u8], number: usize, key: &[u8], hmac_key: &[u8]) -> Option<Vec<u8>> {
    let start = if number == 1 { SALT } else { 0 };
    let end = PAGE - RESERVED;
    let iv: &[u8; IV] = page[end..end + IV].try_into().ok()?;
    let tag = platform::hmac(
        Hash::Sha512,
        hmac_key,
        &[&page[start..end + IV], &(number as u32).to_le_bytes()],
    );
    if tag != page[end + IV..] {
        return None;
    }
    let decrypted = platform::decrypt_aes_cbc(key, iv, &page[start..end], false)?;
    let mut plain = Vec::with_capacity(PAGE);
    if number == 1 {
        plain.extend(SQLITE_HEADER);
    }
    plain.extend(decrypted);
    plain.resize(PAGE, 0);
    Some(plain)
}

// SQLite's write-ahead log: a 32-byte header, then frames of a 24-byte
// header and a page. A frame belongs to the log if it has the header's salt
// and its checksum follows on from the frame before it. A transaction's last
// frame says how many pages the database has after it; the frames after the
// last of those are a transaction not yet committed.
const LOG_HEADER: usize = 32;
const FRAME_HEADER: usize = 24;
const LOG_MAGIC: u32 = 0x377f_0682;

// The pages the log's committed transactions wrote, by number, and how many
// pages the database has after the last; none if it has no transaction.
fn committed(log: &[u8]) -> Option<(HashMap<usize, &[u8]>, usize)> {
    let header = log.get(..LOG_HEADER)?;
    let magic = word(header, 0, true);
    if magic & !1 != LOG_MAGIC || word(header, 8, true) as usize != PAGE {
        return None;
    }
    // The low bit of its magic says which order its checksums read words in.
    let big_endian = magic & 1 == 1;
    let mut sum = checksum(&header[..24], big_endian, (0, 0));
    if sum != (word(header, 24, true), word(header, 28, true)) {
        return None;
    }
    let salt = &header[16..24];
    let mut pages = HashMap::new();
    let mut pending = HashMap::new();
    let mut size = 0;
    let mut at = LOG_HEADER;
    while let Some(frame) = log.get(at..at + FRAME_HEADER + PAGE) {
        let (head, page) = frame.split_at(FRAME_HEADER);
        if &head[8..16] != salt {
            break;
        }
        sum = checksum(&head[..8], big_endian, sum);
        sum = checksum(page, big_endian, sum);
        if sum != (word(head, 16, true), word(head, 20, true)) {
            break;
        }
        pending.insert(word(head, 0, true) as usize, page);
        let after = word(head, 4, true) as usize;
        if after > 0 {
            pages.extend(pending.drain());
            size = after;
        }
        at += FRAME_HEADER + PAGE;
    }
    (size > 0).then_some((pages, size))
}

fn word(bytes: &[u8], at: usize, big_endian: bool) -> u32 {
    let word = [bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3]];
    if big_endian {
        u32::from_be_bytes(word)
    } else {
        u32::from_le_bytes(word)
    }
}

// SQLite's checksum of `bytes`, carried on from `sum`.
fn checksum(bytes: &[u8], big_endian: bool, (mut s0, mut s1): (u32, u32)) -> (u32, u32) {
    for pair in bytes.as_chunks::<8>().0 {
        s0 = s0.wrapping_add(word(pair, 0, big_endian)).wrapping_add(s1);
        s1 = s1.wrapping_add(word(pair, 4, big_endian)).wrapping_add(s0);
    }
    (s0, s1)
}

#[cfg(test)]
mod tests {
    use super::*;

    const KEY: [u8; 32] = [7; 32];

    // A plain database with SQLCipher's room at the end of each page.
    fn plain_database(rows: &[&str]) -> Vec<u8> {
        let mut db = Connection::open_in_memory().unwrap();
        let reserve: i32 = RESERVED as i32;
        unsafe {
            rusqlite::ffi::sqlite3_file_control(
                db.handle(),
                c"main".as_ptr(),
                rusqlite::ffi::SQLITE_FCNTL_RESERVE_BYTES,
                (&reserve as *const i32).cast_mut().cast(),
            );
        }
        db.execute_batch("PRAGMA page_size = 4096; VACUUM; CREATE TABLE t (name TEXT);")
            .unwrap();
        for row in rows {
            db.execute("INSERT INTO t VALUES (?1)", [row]).unwrap();
        }
        db.serialize(MAIN_DB).unwrap().to_vec()
    }

    // Page `number` of a plain database as SQLCipher writes it.
    fn seal_page(plain: &[u8], number: usize, salt: &[u8]) -> Vec<u8> {
        let start = if number == 1 { SALT } else { 0 };
        let end = PAGE - RESERVED;
        let iv = [number as u8; IV];
        let mut page = if number == 1 {
            salt.to_vec()
        } else {
            Vec::new()
        };
        page.extend(platform::encrypt_aes_cbc(&KEY, &iv, &plain[start..end], false).unwrap());
        page.extend(iv);
        let hmac_key = hmac_key(&KEY, salt).unwrap();
        let tag = platform::hmac(
            Hash::Sha512,
            &hmac_key,
            &[&page[start..end + IV], &(number as u32).to_le_bytes()],
        );
        page.extend(tag);
        page
    }

    fn seal(plain: &[u8], salt: &[u8]) -> Vec<u8> {
        plain
            .chunks(PAGE)
            .enumerate()
            .flat_map(|(index, page)| seal_page(page, index + 1, salt))
            .collect()
    }

    // A write-ahead log of `frames`, each a page number, the pages after it
    // if it ends a transaction, and the page.
    fn log(frames: &[(u32, u32, Vec<u8>)]) -> Vec<u8> {
        let mut log = Vec::new();
        log.extend((LOG_MAGIC | 1).to_be_bytes());
        log.extend(3_007_000u32.to_be_bytes());
        log.extend((PAGE as u32).to_be_bytes());
        log.extend(0u32.to_be_bytes());
        log.extend([1, 2, 3, 4, 5, 6, 7, 8]);
        let mut sum = checksum(&log, true, (0, 0));
        log.extend(sum.0.to_be_bytes());
        log.extend(sum.1.to_be_bytes());
        for (number, after, page) in frames {
            let mut head = Vec::new();
            head.extend(number.to_be_bytes());
            head.extend(after.to_be_bytes());
            sum = checksum(&head, true, sum);
            head.extend([1, 2, 3, 4, 5, 6, 7, 8]);
            sum = checksum(page, true, sum);
            head.extend(sum.0.to_be_bytes());
            head.extend(sum.1.to_be_bytes());
            log.extend(head);
            log.extend(page);
        }
        log
    }

    fn names(plain: Vec<u8>) -> Vec<String> {
        let mut db = Connection::open_in_memory().unwrap();
        db.deserialize_read_exact(MAIN_DB, &plain[..], plain.len(), true)
            .unwrap();
        let mut query = db.prepare("SELECT name FROM t").unwrap();
        query
            .query_map([], |row| row.get(0))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap()
    }

    #[test]
    fn opens_what_its_key_locked() {
        let salt = [9u8; SALT];
        let file = seal(&plain_database(&["a", "b"]), &salt);
        assert_eq!(names(decrypt(&file, &[], &KEY).unwrap()), ["a", "b"]);
        assert!(matches!(
            decrypt(&file, &[], &[8; 32]),
            Err(ReadError::Unreadable(why)) if why.contains("key")
        ));
        // A page changed after it was written.
        let mut damaged = file.clone();
        damaged[PAGE + 100] ^= 1;
        assert!(decrypt(&damaged, &[], &KEY).is_err());
    }

    // What a committed transaction wrote is read over the file; what one
    // still being written wrote is not.
    #[test]
    fn reads_the_log_as_far_as_its_last_commit() {
        let salt = [9u8; SALT];
        let before = plain_database(&["a"]);
        let after = plain_database(&["a", "b"]);
        let pages = (after.len() / PAGE) as u32;
        let file = seal(&before, &salt);
        let sealed = seal(&after, &salt);
        let frame = |number: u32, after: u32| {
            let at = (number as usize - 1) * PAGE;
            (number, after, sealed[at..at + PAGE].to_vec())
        };
        let frames: Vec<_> = (1..=pages)
            .map(|number| frame(number, if number == pages { pages } else { 0 }))
            .collect();
        assert_eq!(
            names(decrypt(&file, &log(&frames), &KEY).unwrap()),
            ["a", "b"]
        );
        let uncommitted: Vec<_> = (1..=pages).map(|number| frame(number, 0)).collect();
        assert_eq!(
            names(decrypt(&file, &log(&uncommitted), &KEY).unwrap()),
            ["a"]
        );
    }
}
