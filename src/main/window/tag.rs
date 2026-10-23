// What a Browser carries in Chromium's session, its session tag: the window
// and space it was in, so a restore puts it back (spaces/session.rs), and its
// placeholder's persistent ID, so a restore knows that tab again
// (tabs/placeholder.rs). Chromium keeps the tag with the Browser's tabs, so
// the two never disagree. It reads "<window key>/<space id>|<placeholder>",
// either part empty; the placeholder's ID is last, and kept whole.

use wren::Browser;

use crate::db::SpaceId;

/// A Browser's tag, read.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Tag {
    /// The key of the window it is in, and its space there.
    pub window: Option<(String, SpaceId)>,
    /// Its placeholder's persistent ID.
    pub placeholder: Option<String>,
}

impl Tag {
    /// `browser`'s tag; empty if it has none.
    pub fn of(browser: &Browser) -> Tag {
        Tag::parse(&browser.session_tag())
    }

    /// Changes `browser`'s tag with `change`, keeping the rest.
    pub fn update(browser: &Browser, change: impl FnOnce(&mut Tag)) {
        let mut tag = Tag::of(browser);
        change(&mut tag);
        if let Err(error) = browser.set_session_tag(&tag.to_string()) {
            eprintln!("Wren could not tag a Browser: {error:?}");
        }
    }

    fn parse(text: &str) -> Tag {
        let (window, placeholder) = text.split_once('|').unwrap_or((text, ""));
        let window = window
            .split_once('/')
            .and_then(|(key, space)| Some((key.to_owned(), space.parse().ok()?)));
        let placeholder = Some(placeholder.to_owned()).filter(|id| !id.is_empty());
        Tag {
            window,
            placeholder,
        }
    }
}

impl std::fmt::Display for Tag {
    fn fmt(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
        if let Some((key, space)) = &self.window {
            write!(f, "{key}/{space}")?;
        }
        if let Some(placeholder) = &self.placeholder {
            write!(f, "|{placeholder}")?;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn round_trip(tag: Tag) {
        assert_eq!(Tag::parse(&tag.to_string()), tag);
    }

    #[test]
    fn reads_what_it_writes() {
        round_trip(Tag::default());
        round_trip(Tag {
            window: Some(("ab12".into(), 3)),
            placeholder: None,
        });
        // An ID is kept whole, whatever it holds.
        round_trip(Tag {
            window: None,
            placeholder: Some("x/1|y".into()),
        });
        round_trip(Tag {
            window: Some(("ab12".into(), 3)),
            placeholder: Some("x/1|y".into()),
        });
    }

    #[test]
    fn reads_a_tag_from_before_placeholders() {
        let tag = Tag::parse("ab12/3");
        assert_eq!(tag.window, Some(("ab12".into(), 3)));
        assert_eq!(tag.placeholder, None);
        assert_eq!(Tag::parse("nonsense"), Tag::default());
    }
}
