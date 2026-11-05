// The engines a browser is built on, each reading what every browser on it
// keeps: Chromium's, Gecko's, and Safari's (the one on WebKit).

pub mod chromium;
pub mod gecko;
pub mod safari;

use std::time::{SystemTime, UNIX_EPOCH};

use wren::CookieSameSite;

/// A cookie's `SameSite`, as Chromium and Gecko both number it: 0 none,
/// 1 lax, 2 strict, and anything else (Chromium's -1) unspecified.
fn same_site(value: i64) -> CookieSameSite {
    match value {
        0 => CookieSameSite::None,
        1 => CookieSameSite::Lax,
        2 => CookieSameSite::Strict,
        _ => CookieSameSite::Unspecified,
    }
}

/// `time` in microseconds since 1970.
fn unix_micros(time: SystemTime) -> i64 {
    time.duration_since(UNIX_EPOCH)
        .map_or(0, |since| since.as_micros() as i64)
}
