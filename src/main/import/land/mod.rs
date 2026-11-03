// Landing what a source's reader read in Wren, on the main thread: into the
// profile it goes to (profiles.rs), and as Wren's pins: bookmarks
// (bookmarks.rs) and spaces (spaces.rs). History, cookies and extensions are
// each one call of Wren's, which run.rs makes.

pub mod bookmarks;
pub mod profiles;
pub mod spaces;

use crate::db::{ImportedPin, NamedPin, NewPin, PinLayout, PinPage as WrenPage};
use crate::import::data::{Pin, PinPage};

fn page(page: PinPage) -> WrenPage {
    WrenPage {
        url: page.url,
        title: page.title,
        favicon: page.favicon,
    }
}

/// A pin read from a source, as the database makes it.
fn imported(each: Pin) -> ImportedPin {
    match each {
        Pin::Tab(tab) => ImportedPin::Pin(NamedPin {
            name: tab.name.clone(),
            pin: NewPin::Tab(page(tab)),
        }),
        Pin::Split {
            first,
            second,
            stacked,
            ratio,
        } => ImportedPin::Pin(NamedPin {
            name: None,
            pin: NewPin::Split {
                first: page(first),
                second: page(second),
                layout: if stacked {
                    PinLayout::Stacked
                } else {
                    PinLayout::SideBySide
                },
                ratio,
            },
        }),
        Pin::Folder { name, pins } => ImportedPin::Folder {
            name,
            pins: pins.into_iter().map(imported).collect(),
        },
    }
}
