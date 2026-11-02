// Pins' favicons, from what a source kept of the pages it showed: each
// engine reads which icon it kept for which page (engines/*/favicons.rs),
// and this picks a pin's: its page's own, or else one its site showed, as a
// pin's page may have moved since (a sign-in, a redirect). A pin keeps a PNG
// at 2x, as a tab's favicon is: the smallest of 32 pixels or more, or else
// the largest.

use std::collections::HashMap;

/// The size a pin's favicon is kept at: 16 points, at 2x.
const SIZE: i64 = 32;

/// For each of `pages`, the key of the icon the source kept for it, from
/// `kept`, the pages it kept icons for with each one's key; by the page
/// itself, or else by another page of its site.
pub fn match_pages<K: Copy>(
    pages: &[String],
    kept: impl IntoIterator<Item = (String, K)>,
) -> HashMap<String, K> {
    let mut by_page = HashMap::new();
    let mut by_site = HashMap::new();
    for (page, key) in kept {
        if let Some(site) = site(&page) {
            by_site.entry(site.to_owned()).or_insert(key);
        }
        by_page.insert(page, key);
    }
    pages
        .iter()
        .filter_map(|page| {
            let key = by_page.get(page).or_else(|| by_site.get(site(page)?))?;
            Some((page.clone(), *key))
        })
        .collect()
}

/// Of an icon's images, with their widths, the one a pin keeps; none if
/// none is a PNG.
pub fn best(images: impl IntoIterator<Item = (Vec<u8>, i64)>) -> Option<Vec<u8>> {
    let pngs: Vec<_> = images
        .into_iter()
        .filter(|(data, _)| is_png(data))
        .collect();
    let fit = pngs
        .iter()
        .filter(|(_, width)| *width >= SIZE)
        .min_by_key(|(_, width)| *width);
    let largest = pngs.iter().max_by_key(|(_, width)| *width);
    fit.or(largest).map(|(data, _)| data.clone())
}

fn is_png(data: &[u8]) -> bool {
    data.starts_with(b"\x89PNG\r\n\x1a\n")
}

/// A page's site: its host, without "www.".
fn site(url: &str) -> Option<&str> {
    let (scheme, rest) = url.split_once("://")?;
    if scheme != "http" && scheme != "https" {
        return None;
    }
    let host = rest.split(['/', '?', '#']).next()?;
    let host = host.rsplit('@').next()?;
    let host = host.strip_prefix("www.").unwrap_or(host);
    (!host.is_empty()).then_some(host)
}

#[cfg(test)]
mod tests {
    use super::*;

    const PNG: &[u8] = b"\x89PNG\r\n\x1a\n";

    fn png(tag: u8) -> Vec<u8> {
        [PNG, &[tag]].concat()
    }

    #[test]
    fn a_page_has_its_own_icon_or_else_its_sites() {
        let kept = [
            ("https://mail.google.com/mail/u/0/#inbox".to_owned(), 1),
            ("https://www.github.com/".to_owned(), 2),
            ("https://github.com/wren".to_owned(), 3),
        ];
        let pages = [
            "https://mail.google.com/mail/u/0/#inbox".to_owned(),
            "https://github.com/settings".to_owned(),
            "https://example.com/".to_owned(),
            "file:///Users/me/notes.txt".to_owned(),
        ];
        let matched = match_pages(&pages, kept);
        assert_eq!(matched.get(&pages[0]), Some(&1));
        assert_eq!(matched.get(&pages[1]), Some(&2));
        assert_eq!(matched.get(&pages[2]), None);
        assert_eq!(matched.get(&pages[3]), None);
    }

    #[test]
    fn a_pin_keeps_the_smallest_png_of_its_size_or_the_largest() {
        assert_eq!(
            best([(png(1), 16), (png(2), 64), (png(3), 32)]),
            Some(png(3))
        );
        assert_eq!(best([(png(1), 16), (png(2), 24)]), Some(png(2)));
        assert_eq!(
            best([(b"<svg/>".to_vec(), 65535), (png(1), 16)]),
            Some(png(1))
        );
        assert_eq!(best([(b"<svg/>".to_vec(), 65535)]), None);
    }
}
