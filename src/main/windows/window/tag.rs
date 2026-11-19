// What a Browser carries in Chromium's session, its session tag: the window
// and place it was in, so a restore puts it back (windows/session.rs), and its
// placeholder's persistent ID, so a restore knows that tab again
// (tabs/placeholder.rs). Chromium keeps the tag with the Browser's tabs, so
// the two never disagree. It reads "<window key>/<place>|<placeholder>",
// either part empty; the placeholder's ID is last, and kept whole. A place
// is a space's ID, as it always was, or a profile's (place.rs).

use wren::Browser;

use super::Place;

/// A Browser's tag, read.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Tag {
    /// The key of the window it is in, and its place there.
    pub window: Option<(String, Place)>,
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
            .and_then(|(key, place)| Some((key.to_owned(), place.parse().ok()?)));
        let placeholder = Some(placeholder.to_owned()).filter(|id| !id.is_empty());
        Tag {
            window,
            placeholder,
        }
    }
}

impl std::fmt::Display for Tag {
    fn fmt(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
        if let Some((key, place)) = &self.window {
            write!(f, "{key}/{place}")?;
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
            window: Some(("ab12".into(), Place::Space(3))),
            placeholder: None,
        });
        // An ID is kept whole, whatever it holds.
        round_trip(Tag {
            window: None,
            placeholder: Some("x/1|y".into()),
        });
        round_trip(Tag {
            window: Some(("ab12".into(), Place::Space(3))),
            placeholder: Some("x/1|y".into()),
        });
        round_trip(Tag {
            window: Some((
                "ab12".into(),
                Place::Profile {
                    id: "Profile 1".into(),
                    off_the_record: false,
                },
            )),
            placeholder: Some("x/1|y".into()),
        });
    }

    #[test]
    fn reads_a_tag_from_before_placeholders() {
        let tag = Tag::parse("ab12/3");
        assert_eq!(tag.window, Some(("ab12".into(), Place::Space(3))));
        assert_eq!(tag.placeholder, None);
        assert_eq!(Tag::parse("nonsense"), Tag::default());
    }
}
