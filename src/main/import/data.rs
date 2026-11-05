// What a source's reader hands over (source.rs), beside Wren's own
// `HistoryEntry` and `Cookie`: plain data, read on one thread and landed on
// another.

use std::collections::HashMap;

use serde::Serialize;

/// A browser's bookmarks, as the pins they come over as: its bar's, as pins
/// of their own, and the rest, in a folder (`OTHER_BOOKMARKS`).
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Bookmarks {
    pub bar: Vec<Pin>,
    pub other: Vec<Pin>,
}

/// The folder the bookmarks off the bar come over in.
pub const OTHER_BOOKMARKS: &str = "Other Bookmarks";

impl Bookmarks {
    /// How many pages there are, in folders too.
    pub fn count(&self) -> usize {
        count_pins(&self.bar) + count_pins(&self.other)
    }

    /// Them, less any folder with no page in it.
    pub fn pruned(self) -> Bookmarks {
        Bookmarks {
            bar: pruned(self.bar),
            other: pruned(self.other),
        }
    }

    /// Gives each page the favicon its source kept for it.
    pub fn with_favicons(mut self, favicons: impl FnOnce(&[String]) -> Favicons) -> Bookmarks {
        give_favicons([&mut self.bar, &mut self.other], favicons);
        self
    }

    /// As the pins they come over as: the bar's, then a folder of the rest.
    pub fn into_pins(self) -> Vec<Pin> {
        let mut pins = self.bar;
        if !self.other.is_empty() {
            pins.push(Pin::closed_folder(OTHER_BOOKMARKS, self.other));
        }
        pins
    }
}

/// A source's favicons, by page (`Source::favicons`).
pub type Favicons = HashMap<String, Vec<u8>>;

/// The addresses a bookmark or a pin may have: a web page's or a file's.
pub fn is_page(url: &str) -> bool {
    ["http://", "https://", "ftp://", "file://"]
        .iter()
        .any(|scheme| url.starts_with(scheme))
}

/// An extension of the source's from the Chrome Web Store.
#[derive(Clone, Debug, PartialEq)]
pub struct StoreExtension {
    pub id: String,
    pub name: String,
    /// Its icon, as a PNG, if it has one to be read.
    pub icon: Option<Vec<u8>>,
    /// It is on in the source.
    pub enabled: bool,
}

/// What a browser that keeps spaces keeps beyond its engine.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Spaces {
    /// The pins every space shows: Wren's favourites.
    pub favorites: Vec<Pin>,
    pub spaces: Vec<Space>,
}

/// How many spaces a source keeps, and their pins.
#[derive(Clone, Copy, Debug, Default, PartialEq, Serialize)]
pub struct SpaceCount {
    pub spaces: usize,
    /// Pins, the favourites and those in folders too.
    pub pins: usize,
}

impl Spaces {
    pub fn count(&self) -> SpaceCount {
        SpaceCount {
            spaces: self.spaces.len(),
            pins: count_pins(&self.favorites)
                + self
                    .spaces
                    .iter()
                    .map(|space| count_pins(&space.pins))
                    .sum::<usize>(),
        }
    }

    /// Gives each pin's page the favicon its source kept for it.
    pub fn with_favicons(mut self, favicons: impl FnOnce(&[String]) -> Favicons) -> Spaces {
        let spaces = self.spaces.iter_mut().map(|space| &mut space.pins);
        give_favicons(std::iter::once(&mut self.favorites).chain(spaces), favicons);
        self
    }
}

// Gives each page in `trees` the favicon `favicons` finds for it, asked for
// every page at once.
fn give_favicons<'a>(
    trees: impl IntoIterator<Item = &'a mut Vec<Pin>>,
    favicons: impl FnOnce(&[String]) -> Favicons,
) {
    let mut pages = Vec::new();
    for pins in trees {
        pages_in(pins, &mut pages);
    }
    let urls: Vec<String> = pages.iter().map(|page| page.url.clone()).collect();
    let found = favicons(&urls);
    for page in pages {
        page.favicon = found.get(&page.url).cloned();
    }
}

fn pages_in<'a>(pins: &'a mut [Pin], pages: &mut Vec<&'a mut PinPage>) {
    for pin in pins {
        match pin {
            Pin::Tab(page) => pages.push(page),
            Pin::Split { first, second, .. } => {
                pages.push(first);
                pages.push(second);
            }
            Pin::Folder { pins, .. } => pages_in(pins, pages),
        }
    }
}

/// `pins`, less any folder with no page in it.
pub fn pruned(pins: Vec<Pin>) -> Vec<Pin> {
    pins.into_iter()
        .filter_map(|pin| match pin {
            Pin::Folder { name, pins, open } => {
                let pins = pruned(pins);
                (!pins.is_empty()).then_some(Pin::Folder { name, pins, open })
            }
            pin => Some(pin),
        })
        .collect()
}

pub fn count_pins(pins: &[Pin]) -> usize {
    pins.iter()
        .map(|pin| match pin {
            Pin::Folder { pins, .. } => count_pins(pins),
            _ => 1,
        })
        .sum()
}

#[derive(Clone, Debug, PartialEq)]
pub struct Space {
    pub name: String,
    pub icon: SpaceIcon,
    pub look: Look,
    pub pins: Vec<Pin>,
}

/// How a space was drawn in its source.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Look {
    /// Its colours, the first its main one, in extended sRGB: each part
    /// 0–1, or past it for a colour sRGB does not hold. None for the
    /// source's default.
    pub colours: Vec<[f64; 3]>,
    /// Whether what is over it is drawn dark or light; None for as its
    /// colour is.
    pub dark: Option<bool>,
    /// How much of its colour shows, 0–1; None for Wren's default.
    pub intensity: Option<f64>,
    /// How grainy it is, 0–1.
    pub noise: f64,
}

#[derive(Clone, Debug, PartialEq)]
pub enum SpaceIcon {
    Emoji(String),
    /// The source's own name for one of its icons.
    Named(String),
    None,
}

/// A page as a pin has it.
#[derive(Clone, Debug, PartialEq)]
pub struct PinPage {
    /// The page's title, as the source last saw it.
    pub title: String,
    /// The user's name for it, which Wren keeps over its title.
    pub name: Option<String>,
    pub url: String,
    /// A PNG at 2x, as a tab's favicon is.
    pub favicon: Option<Vec<u8>>,
}

impl PinPage {
    /// The page `url`, with the title the source last saw it with, and the
    /// name the user gave it, if any; its title is its name, or else its
    /// address, if the source kept none.
    pub fn new(title: Option<&str>, name: Option<&str>, url: &str) -> PinPage {
        fn given(text: Option<&str>) -> Option<&str> {
            text.map(str::trim).filter(|text| !text.is_empty())
        }
        let name = given(name);
        PinPage {
            title: given(title).or(name).unwrap_or(url).to_owned(),
            name: name.map(str::to_owned),
            url: url.to_owned(),
            favicon: None,
        }
    }

    /// A bookmark of `url`: its name, which the user sees and may change,
    /// stays the pin's, as a bookmark's does, whatever the page is titled.
    pub fn bookmark(name: &str, url: &str) -> PinPage {
        PinPage::new(None, Some(name), url)
    }
}

#[derive(Clone, Debug, PartialEq)]
pub enum Pin {
    Tab(PinPage),
    /// Two pages side by side, or stacked; the first's share of the space.
    Split {
        first: PinPage,
        second: PinPage,
        stacked: bool,
        ratio: f64,
    },
    Folder {
        name: String,
        pins: Vec<Pin>,
        /// It shows its pins; closed where the source does not say.
        open: bool,
    },
}

impl Pin {
    /// A folder, closed: one of bookmarks, which no browser keeps open.
    pub fn closed_folder(name: &str, pins: Vec<Pin>) -> Pin {
        Pin::Folder {
            name: name.to_owned(),
            pins,
            open: false,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tab(url: &str) -> Pin {
        Pin::Tab(PinPage::bookmark("", url))
    }

    #[test]
    fn bookmarks_are_the_bars_pins_then_a_folder_of_the_rest() {
        let bookmarks = Bookmarks {
            bar: vec![
                tab("https://x.example/"),
                Pin::closed_folder("Y", vec![tab("https://y.example/")]),
                Pin::closed_folder("Empty", Vec::new()),
            ],
            other: vec![tab("https://z.example/")],
        }
        .pruned();
        let pins = bookmarks.into_pins();
        assert_eq!(pins.len(), 3);
        assert!(matches!(&pins[1], Pin::Folder { name, .. } if name == "Y"));
        assert!(
            matches!(&pins[2], Pin::Folder { name, pins, open: false } if name == OTHER_BOOKMARKS && pins.len() == 1)
        );
        // With nothing off the bar, no folder for it.
        let bar_only = Bookmarks {
            bar: vec![tab("https://x.example/")],
            other: Vec::new(),
        };
        assert_eq!(bar_only.into_pins().len(), 1);
    }
}
