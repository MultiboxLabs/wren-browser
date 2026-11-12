// Safari's cookies: `Cookies.binarycookies` in its container, a format of
// Apple's, small enough to read here. The file is the magic "cook", its page
// count and each page's size (big-endian); a page, its cookie count and
// each cookie's offset (little-endian); a cookie, its size, its flags, the
// offsets of its domain, name, path and value (NUL-terminated), then its
// expiry and creation, seconds since 2001 as little-endian f64s.
//
// Of the flags, 1 is Secure and 4 HttpOnly. A file of a Safari that keeps
// SameSite has it in two more: 8 alone is Lax, 16 alone unspecified, both
// Strict, and neither None. A file without them, where no cookie has
// either, is read as unspecified throughout. Apple documents none of this:
// it was found by comparing a file's cookies with Chromium's of the same
// sites.

use std::collections::HashSet;
use std::fs;
use std::path::PathBuf;
use std::time::SystemTime;

use wren::{Cookie, CookieSameSite};

use super::unix_ms;
use crate::import::engines::unix_micros;
use crate::import::source::{COOKIE_BATCH, CookieCount, ReadError};
use crate::platform;

fn path() -> PathBuf {
    platform::home_dir()
        .join("Library/Containers/com.apple.Safari/Data/Library/Cookies/Cookies.binarycookies")
}

// Every cookie in the file that has not expired, and how many it could not
// read. Safari keeps an expired one until it next reads it.
fn all() -> Result<Parsed, ReadError> {
    let now = unix_micros(SystemTime::now()) / 1000;
    let mut all =
        parse(&fs::read(path())?).ok_or(ReadError::Unreadable("not a cookie file".into()))?;
    all.cookies.retain(|cookie| cookie.expires_ms > now);
    Ok(all)
}

pub fn count() -> Result<CookieCount, ReadError> {
    let all = all()?.cookies;
    let sites = all
        .iter()
        .map(|cookie| cookie.domain.trim_start_matches('.'))
        .collect::<HashSet<_>>()
        .len();
    Ok(CookieCount {
        cookies: all.len(),
        sites,
    })
}

pub fn read(batch: &mut dyn FnMut(Vec<Cookie>)) -> Result<usize, ReadError> {
    let all = all()?;
    for chunk in all.cookies.chunks(COOKIE_BATCH) {
        batch(chunk.to_vec());
    }
    Ok(all.unread)
}

/// The cookies of a file, and how many it has that could not be read.
pub struct Parsed {
    pub cookies: Vec<Cookie>,
    pub unread: usize,
}

/// The file's cookies; none if it is not a cookie file. A cookie that cannot
/// be read, such as one whose text is not UTF-8, is counted and left out,
/// and so is a page's.
pub fn parse(file: &[u8]) -> Option<Parsed> {
    let (read, unread) = pages(file)?;
    let keeps_same_site = read.iter().any(|(_, flags)| flags & SAME_SITE != 0);
    let cookies = read
        .into_iter()
        .map(|(cookie, flags)| Cookie {
            same_site: if keeps_same_site {
                same_site(flags)
            } else {
                CookieSameSite::Unspecified
            },
            ..cookie
        })
        .collect();
    Some(Parsed { cookies, unread })
}

const SECURE: usize = 1;
const HTTP_ONLY: usize = 4;
const LAX: usize = 8;
const UNSPECIFIED: usize = 16;
const SAME_SITE: usize = LAX | UNSPECIFIED;

fn same_site(flags: usize) -> CookieSameSite {
    match flags & SAME_SITE {
        LAX => CookieSameSite::Lax,
        UNSPECIFIED => CookieSameSite::Unspecified,
        SAME_SITE => CookieSameSite::Strict,
        _ => CookieSameSite::None,
    }
}

// Every cookie in the file, with its flags, and how many could not be read.
// A page that is not all there ends the reading: the pages after it are not
// where their sizes say.
fn pages(file: &[u8]) -> Option<(Vec<(Cookie, usize)>, usize)> {
    let be = |at: usize| Some(u32::from_be_bytes(file.get(at..at + 4)?.try_into().ok()?) as usize);
    if file.get(..4)? != b"cook" {
        return None;
    }
    let pages = be(4)?;
    let mut page_at = 8 + 4 * pages;
    let mut cookies = Vec::new();
    let mut unread = 0;
    for index in 0..pages {
        let Some(size) = be(8 + 4 * index) else {
            break;
        };
        let Some(page) = page_at
            .checked_add(size)
            .and_then(|end| file.get(page_at..end))
        else {
            break;
        };
        unread += read_page(page, &mut cookies);
        page_at += size;
    }
    Some((cookies, unread))
}

fn le(bytes: &[u8], at: usize) -> Option<usize> {
    Some(u32::from_le_bytes(bytes.get(at..at + 4)?.try_into().ok()?) as usize)
}

// Adds the page's cookies to `cookies`, and answers how many it could not
// read.
fn read_page(page: &[u8], cookies: &mut Vec<(Cookie, usize)>) -> usize {
    // No more than the page has room to give the offsets of.
    let Some(count) = le(page, 4).map(|count| count.min(page.len().saturating_sub(8) / 4)) else {
        return 0;
    };
    let mut unread = 0;
    for index in 0..count {
        let cookie = le(page, 8 + 4 * index).and_then(|at| {
            let size = le(page, at)?;
            read_cookie(page.get(at..at.checked_add(size)?)?)
        });
        match cookie {
            Some(cookie) => cookies.push(cookie),
            None => unread += 1,
        }
    }
    unread
}

fn read_cookie(cookie: &[u8]) -> Option<(Cookie, usize)> {
    let flags = le(cookie, 8)?;
    let text = |offset_at: usize| -> Option<String> {
        let from = le(cookie, offset_at)?;
        let rest = cookie.get(from..)?;
        let end = rest.iter().position(|byte| *byte == 0)?;
        String::from_utf8(rest[..end].to_vec()).ok()
    };
    let time = |at: usize| -> Option<f64> {
        Some(f64::from_le_bytes(cookie.get(at..at + 8)?.try_into().ok()?))
    };
    let read = Cookie {
        domain: text(16)?,
        name: text(20)?,
        path: text(24)?,
        value: text(28)?,
        expires_ms: unix_ms(time(40)?),
        created_ms: unix_ms(time(48)?),
        last_access_ms: 0,
        secure: flags & SECURE != 0,
        http_only: flags & HTTP_ONLY != 0,
        same_site: CookieSameSite::Unspecified,
        partition_site: None,
        partition_cross_site_ancestor: false,
    };
    Some((read, flags))
}

#[cfg(test)]
mod tests {
    use super::*;

    // One cookie with `flags`, as Safari writes it.
    fn cookie(flags: u32) -> Vec<u8> {
        let strings = [".example.com", "id", "/", "abc"];
        let header = 56;
        let mut offsets = Vec::new();
        let mut body = Vec::new();
        for string in strings {
            offsets.push((header + body.len()) as u32);
            body.extend(string.as_bytes());
            body.push(0);
        }
        let mut out = Vec::new();
        out.extend(((header + body.len()) as u32).to_le_bytes());
        out.extend(0u32.to_le_bytes());
        out.extend(flags.to_le_bytes());
        out.extend(0u32.to_le_bytes());
        for offset in offsets {
            out.extend(offset.to_le_bytes());
        }
        out.extend([0u8; 8]);
        out.extend(700_000_000f64.to_le_bytes());
        out.extend(600_000_000f64.to_le_bytes());
        out.extend(body);
        out
    }

    // A file of one page with `cookies`.
    fn file(cookies: &[Vec<u8>]) -> Vec<u8> {
        let mut page = vec![0, 0, 1, 0];
        page.extend((cookies.len() as u32).to_le_bytes());
        let mut at = 8 + 4 * cookies.len() + 4;
        for cookie in cookies {
            page.extend((at as u32).to_le_bytes());
            at += cookie.len();
        }
        page.extend(0u32.to_le_bytes());
        for cookie in cookies {
            page.extend(cookie);
        }
        let mut file = b"cook".to_vec();
        file.extend(1u32.to_be_bytes());
        file.extend((page.len() as u32).to_be_bytes());
        file.extend(page);
        file
    }

    #[test]
    fn reads_a_cookie_file() {
        let cookies = parse(&file(&[cookie(5)])).unwrap().cookies;
        assert_eq!(cookies.len(), 1);
        let cookie = &cookies[0];
        assert_eq!(
            (
                cookie.domain.as_str(),
                cookie.name.as_str(),
                cookie.value.as_str()
            ),
            (".example.com", "id", "abc")
        );
        assert!(cookie.secure && cookie.http_only);
        assert_eq!(cookie.expires_ms, 1_678_307_200_000);
    }

    // SameSite is read from a file that keeps it, and is unspecified
    // throughout one that does not.
    #[test]
    fn reads_same_site_where_the_file_keeps_it() {
        let read = |flags: &[u32]| -> Vec<CookieSameSite> {
            let cookies: Vec<Vec<u8>> = flags.iter().map(|flags| cookie(*flags)).collect();
            parse(&file(&cookies))
                .unwrap()
                .cookies
                .iter()
                .map(|cookie| cookie.same_site)
                .collect()
        };
        assert_eq!(
            read(&[1, 1 | 8, 1 | 16, 1 | 24]),
            [
                CookieSameSite::None,
                CookieSameSite::Lax,
                CookieSameSite::Unspecified,
                CookieSameSite::Strict
            ]
        );
        assert_eq!(
            read(&[1, 5]),
            [CookieSameSite::Unspecified, CookieSameSite::Unspecified]
        );
    }

    // A cookie that cannot be read is counted and left out, and the rest
    // are read.
    #[test]
    fn leaves_out_a_cookie_it_cannot_read() {
        let mut bad = cookie(5);
        // Its value, last in it, is not UTF-8.
        let at = bad.len() - 2;
        bad[at] = 0xff;
        let parsed = parse(&file(&[cookie(5), bad, cookie(5)])).unwrap();
        assert_eq!((parsed.cookies.len(), parsed.unread), (2, 1));
        assert!(parse(b"not a cookie file").is_none());
    }
}
