// Which tabs keep to their page's origin, and what Wren answers their
// navigations. A tab keeps to it if it opens peeks, a pin's for now, or is
// behind a peek. It watches its navigations, and each one its page starts to
// another origin, by a click or by a script, goes to a new tab in front
// instead. From a tab that opens peeks, that tab becomes a peek as it first
// comes (settle.rs). From a tab behind a peek, which has one already, it is
// a tab of the list, and the tab behind keeps its page under the overlay.
// This file is the one place that says which tabs watch, so the tabs that
// watch and the navigations sent to a new tab never disagree.

use wren::{BrowserTab, NavigationAnswer, NavigationRequest};

use super::opens_peeks;
use crate::tabs::roles;

/// Makes each of `tabs` that keeps to its origin watch its navigations,
/// and every other stop.
pub(super) fn watch(tabs: &[BrowserTab]) {
    for tab in tabs {
        let keeps = keeps_to_origin(*tab);
        if tab
            .state()
            .is_ok_and(|state| state.watches_navigations != keeps)
        {
            // It fails only for a tab that has closed.
            let _ = tab.set_watches_navigations(keeps);
        }
    }
}

/// Wren's answer to a watched tab's navigation: a new tab in front for one
/// its page starts to another origin, from a tab that keeps to its origin;
/// the rest go ahead. A navigation the person or Wren starts, such as from
/// the omnibox, a reload or going back, is not the page's, and stays in the
/// tab. Runs inside Chromium's call, so it only answers.
pub fn answer(request: &NavigationRequest) -> NavigationAnswer {
    let tab = request.tab;
    let leaves =
        request.by_page && keeps_to_origin(tab) && is_other_origin(&tab.url(), &request.url);
    if leaves {
        NavigationAnswer::OpenInNewTab
    } else {
        NavigationAnswer::Allow
    }
}

// Whether `tab` keeps to its page's origin: it opens peeks, or is behind
// one.
fn keeps_to_origin(tab: BrowserTab) -> bool {
    opens_peeks(tab) || roles::peek_of(tab).is_some()
}

// Whether `to`, a web address, is on another origin than `from`: another
// scheme, host or port. An address that is not a web page's, such as a
// file's or Chromium's own, stays in the tab.
fn is_other_origin(from: &str, to: &str) -> bool {
    origin(to).is_some_and(|to| origin(from) != Some(to))
}

// The origin of a web address, `http` or `https`: its scheme, its host in
// lower case, and its port, the scheme's own when it names none. None for
// any other address.
fn origin(url: &str) -> Option<(String, String, u16)> {
    let (scheme, rest) = url.split_once("://")?;
    let scheme = scheme.to_ascii_lowercase();
    let default = match scheme.as_str() {
        "http" => 80,
        "https" => 443,
        _ => return None,
    };
    let authority = rest.split(['/', '?', '#']).next()?;
    let host_port = authority
        .rsplit_once('@')
        .map_or(authority, |(_, after)| after);
    // An IPv6 host is in brackets, with colons of its own.
    let (host, port) = match host_port.rfind(':') {
        Some(at) if !host_port[at..].contains(']') => (&host_port[..at], &host_port[at + 1..]),
        _ => (host_port, ""),
    };
    let port = if port.is_empty() {
        default
    } else {
        port.parse().ok()?
    };
    Some((scheme, host.to_ascii_lowercase(), port))
}

#[cfg(test)]
mod tests {
    use super::is_other_origin;

    #[test]
    fn the_same_origin_stays() {
        assert!(!is_other_origin(
            "https://x.com/home",
            "https://x.com/explore?q=1#top"
        ));
        assert!(!is_other_origin("https://X.com/", "https://x.com:443/a"));
        assert!(!is_other_origin(
            "http://localhost:3000/",
            "http://localhost:3000/b"
        ));
        assert!(!is_other_origin(
            "https://[::1]:8443/",
            "https://[::1]:8443/x"
        ));
    }

    #[test]
    fn another_host_scheme_or_port_leaves() {
        assert!(is_other_origin("https://x.com/", "https://www.x.com/"));
        assert!(is_other_origin(
            "https://mail.google.com/",
            "https://drive.google.com/"
        ));
        assert!(is_other_origin("http://x.com/", "https://x.com/"));
        assert!(is_other_origin(
            "http://localhost:3000/",
            "http://localhost:3001/"
        ));
        assert!(is_other_origin("https://[::1]:8443/", "https://[::1]/"));
    }

    #[test]
    fn a_page_that_is_no_web_page_stays() {
        assert!(!is_other_origin(
            "https://x.com/",
            "file:///Users/me/a.html"
        ));
        assert!(!is_other_origin("https://x.com/", "chrome://settings"));
        assert!(!is_other_origin("https://x.com/", "mailto:me@x.com"));
    }

    #[test]
    fn a_tab_on_no_web_page_leaves_for_one() {
        assert!(is_other_origin("chrome://newtab/", "https://x.com/"));
        assert!(is_other_origin("", "https://x.com/"));
    }

    #[test]
    fn credentials_are_not_the_host() {
        assert!(!is_other_origin("https://x.com/", "https://me:pw@x.com/"));
    }
}
