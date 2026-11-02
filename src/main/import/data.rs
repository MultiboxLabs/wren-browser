// What a source's reader hands over (source.rs), beside Wren's own
// `HistoryEntry` and `Cookie`: plain data, read on one thread and landed on
// another.

use std::collections::HashMap;

/// A folder of bookmarks, and what is in it, in order.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct BookmarkFolder {
    pub title: String,
    pub children: Vec<Bookmark>,
}

#[derive(Clone, Debug, PartialEq)]
pub enum Bookmark {
    Link { title: String, url: String },
    Folder(BookmarkFolder),
}

impl BookmarkFolder {
    /// How many links are in it, its folders' too.
    pub fn count(&self) -> usize {
        self.children
            .iter()
            .map(|child| match child {
                Bookmark::Link { .. } => 1,
                Bookmark::Folder(folder) => folder.count(),
            })
            .sum()
    }

    /// It, less its folders with no link in them.
    pub fn pruned(self) -> BookmarkFolder {
        BookmarkFolder {
            title: self.title,
            children: self
                .children
                .into_iter()
                .filter_map(|child| match child {
                    Bookmark::Folder(folder) => {
                        let folder = folder.pruned();
                        (folder.count() > 0).then_some(Bookmark::Folder(folder))
                    }
                    link => Some(link),
                })
                .collect(),
        }
    }
}

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

impl Spaces {
    /// How many pins there are, the favourites and those in folders too.
    pub fn pin_count(&self) -> usize {
        count_pins(&self.favorites)
            + self
                .spaces
                .iter()
                .map(|space| count_pins(&space.pins))
                .sum::<usize>()
    }

    /// Every pin's page, the favourites' and those in folders too.
    pub fn pages_mut(&mut self) -> Vec<&mut PinPage> {
        let mut pages = Vec::new();
        let spaces = self.spaces.iter_mut().map(|space| &mut space.pins);
        for pins in std::iter::once(&mut self.favorites).chain(spaces) {
            pages_in(pins, &mut pages);
        }
        pages
    }

    /// Gives each pin's page the favicon its source kept for it
    /// (`Source::favicons`).
    pub fn with_favicons(
        mut self,
        favicons: impl FnOnce(&[String]) -> HashMap<String, Vec<u8>>,
    ) -> Spaces {
        let urls: Vec<String> = self
            .pages_mut()
            .iter()
            .map(|page| page.url.clone())
            .collect();
        let found = favicons(&urls);
        for page in self.pages_mut() {
            page.favicon = found.get(&page.url).cloned();
        }
        self
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
    /// Its colours, the first its main one; none for the source's default.
    pub colours: Vec<[u8; 3]>,
    pub pins: Vec<Pin>,
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
    pub title: String,
    pub url: String,
    /// A PNG at 2x, as a tab's favicon is.
    pub favicon: Option<Vec<u8>>,
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
    },
}
