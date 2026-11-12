// Safari's cookies: `Cookies.binarycookies` in its container, a format of
// Apple's, small enough to read here. The file is the magic "cook", its page
// count and each page's size (big-endian); a page, its cookie count and
// each cookie's offset (little-endian); a cookie, its size, its flags (1
// secure, 4 HttpOnly), the offsets of its domain, name, path and value
// (NUL-terminated), then its expiry and creation, seconds since 2001 as
// little-endian f64s. It says nothing of SameSite.

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

// Every cookie in the file that has not expired. Safari keeps an expired
// one until it next reads it.
fn all() -> Result<Vec<Cookie>, ReadError> {
    let now = unix_micros(SystemTime::now()) / 1000;
    let all = parse(&fs::read(path())?).ok_or(ReadError::Unreadable("not a cookie file".into()))?;
    Ok(all
        .into_iter()
        .filter(|cookie| cookie.expires_ms > now)
        .collect())
}

pub fn count() -> Result<CookieCount, ReadError> {
    let all = all()?;
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
    for chunk in all()?.chunks(COOKIE_BATCH) {
        batch(chunk.to_vec());
    }
    Ok(0)
}

pub fn parse(file: &[u8]) -> Option<Vec<Cookie>> {
    let be = |at: usize| Some(u32::from_be_bytes(file.get(at..at + 4)?.try_into().ok()?) as usize);
    if file.get(..4)? != b"cook" {
        return None;
    }
    let pages = be(4)?;
    let mut page_at = 8 + 4 * pages;
    let mut cookies = Vec::new();
    for index in 0..pages {
        let size = be(8 + 4 * index)?;
        let page = file.get(page_at..page_at + size)?;
        cookies.extend(read_page(page)?);
        page_at += size;
    }
    Some(cookies)
}

fn le(bytes: &[u8], at: usize) -> Option<usize> {
    Some(u32::from_le_bytes(bytes.get(at..at + 4)?.try_into().ok()?) as usize)
}

fn read_page(page: &[u8]) -> Option<Vec<Cookie>> {
    let count = le(page, 4)?;
    (0..count)
        .map(|index| {
            let at = le(page, 8 + 4 * index)?;
            let size = le(page, at)?;
            read_cookie(page.get(at..at + size)?)
        })
        .collect()
}

fn read_cookie(cookie: &[u8]) -> Option<Cookie> {
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
    Some(Cookie {
        domain: text(16)?,
        name: text(20)?,
        path: text(24)?,
        value: text(28)?,
        expires_ms: unix_ms(time(40)?),
        created_ms: unix_ms(time(48)?),
        last_access_ms: 0,
        secure: flags & 1 != 0,
        http_only: flags & 4 != 0,
        same_site: CookieSameSite::Unspecified,
        partition_site: None,
        partition_cross_site_ancestor: false,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    // One cookie, as Safari writes it.
    fn cookie() -> Vec<u8> {
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
        out.extend(5u32.to_le_bytes());
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

    #[test]
    fn reads_a_cookie_file() {
        let cookie = cookie();
        let mut page = vec![0, 0, 1, 0];
        page.extend(1u32.to_le_bytes());
        page.extend(16u32.to_le_bytes());
        page.extend(0u32.to_le_bytes());
        page.extend(cookie);
        let mut file = b"cook".to_vec();
        file.extend(1u32.to_be_bytes());
        file.extend((page.len() as u32).to_be_bytes());
        file.extend(page);
        let cookies = parse(&file).unwrap();
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
}
