// What an item's menu is for, and what each of its commands does. The page
// names an item and the side of it that was pressed (ipc/items.rs); this
// finds it in the window (`Subject`), menus/item.rs builds its menu, and
// `choose` does what is chosen. Keeping a tab, or keeping it elsewhere, is
// a move like a drop's (`move_items`). Several rows marked together, of the
// list or of the pins, are one subject, and their menu acts on them all.

use std::rc::Rc;

use wren::{Browser, BrowserTab, MainThread, SplitLayout, TabGroup};

use super::{Destination, ItemRef, Moved, Target, failed, move_items, tab_of};
use crate::app::State;
use crate::clipboard;
use crate::db::{PinId, PinKind, PinPage, PinPlace, PinRow, SpaceId};
use crate::menus::{self, item as command};
use crate::pins;
use crate::shell::{Place, WindowId};
use crate::tabs;

/// The item a menu is for, in the window it was asked in.
pub struct Subject {
    pub window: WindowId,
    /// The place the window is on, whose items it shows.
    pub place: Place,
    pub what: What,
}

pub enum What {
    /// A tab of the list, the one pressed of a split's two.
    Listed {
        browser: Browser,
        tab: BrowserTab,
    },
    /// A pinned tab or a favourite: its tabs in the window's Browser, in its
    /// pages' order, none if it is not open there; which of them are away
    /// from its pages; and the side pressed.
    Kept {
        pin: PinRow,
        favorite: bool,
        browser: Option<Browser>,
        tabs: Vec<BrowserTab>,
        away: Vec<usize>,
        side: usize,
    },
    Folder(PinRow),
    Group {
        browser: Browser,
        group: TabGroup,
    },
    /// Several rows of the list, marked together: one tab of each, which
    /// stands for its split, in the list's order.
    Marked {
        browser: Browser,
        tabs: Vec<BrowserTab>,
    },
    /// Several pinned tabs of the window's space, marked together, in the
    /// pins' order, and the space's folders, each by its ID and its name.
    MarkedPins {
        pins: Vec<PinId>,
        browser: Option<Browser>,
        folders: Vec<(PinId, String)>,
    },
}

/// What a choice did: the folder New Folder made, for the page to name, and
/// what each move did, for what counts it.
#[derive(Default)]
pub struct Did {
    pub folder: Option<PinId>,
    pub moved: Vec<Moved>,
}

impl Subject {
    /// The item the page names in `window`, pressed on `side`; or, if it is
    /// one of several rows marked there, all of them: `marked` names each,
    /// all tabs of the list or all pinned tabs.
    pub fn find(
        state: &State,
        mt: MainThread,
        window: WindowId,
        item: &ItemRef,
        side: usize,
        marked: &[ItemRef],
    ) -> Result<Subject, String> {
        let found = state.windows.get(window).ok_or("The window is closing.")?;
        let place = found.place().ok_or("The window is on no space.")?;
        let browser = found.browser();
        let shown = || browser.clone().ok_or("The window has no tabs.");
        let what = match item {
            ItemRef::Tab(_) if marked.len() > 1 => {
                let browser = shown()?;
                let tabs: Vec<BrowserTab> = marked
                    .iter()
                    .map(|marked| match marked {
                        ItemRef::Tab(id) => tab_of(mt, &browser, *id),
                        _ => Err("Only tabs of the list are marked with one.".into()),
                    })
                    .collect::<Result<_, _>>()?;
                if tabs.iter().any(|tab| tabs::is_pinned(*tab)) {
                    return Err("Only tabs of the list are marked with one.".into());
                }
                What::Marked { browser, tabs }
            }
            ItemRef::Pin(_) if marked.len() > 1 => {
                let Place::Space(space) = place else {
                    return Err("A window on a profile has no pins.".into());
                };
                let pins: Vec<PinId> = marked
                    .iter()
                    .map(|marked| match marked {
                        ItemRef::Pin(id) => pinned_tab(state, space, *id),
                        _ => Err("Only pinned tabs are marked with one.".into()),
                    })
                    .collect::<Result<_, _>>()?;
                let mut folders = Vec::new();
                folders_in(state.db.space_pins(space)?, &mut folders);
                What::MarkedPins {
                    pins,
                    browser,
                    folders,
                }
            }
            ItemRef::Tab(id) => {
                let browser = shown()?;
                let tab = tab_of(mt, &browser, *id)?;
                What::Listed { browser, tab }
            }
            ItemRef::Group(id) => {
                let browser = shown()?;
                let group = tabs::group(mt, &browser, id).ok_or("There is no such group.")?;
                What::Group { browser, group }
            }
            ItemRef::Pin(id) => {
                let (_, space, pin) = state.db.pin(*id)?.ok_or("That pin is gone.")?;
                if matches!(pin.kind, PinKind::Folder { .. }) {
                    What::Folder(pin)
                } else {
                    let open = browser.as_ref().and_then(|browser| {
                        let open = pins::open_pins(browser);
                        open.into_iter().find(|open| open.pin == *id)
                    });
                    let (tabs, away) = open.map_or_else(Default::default, |open| {
                        let away = (0..open.away.len()).filter(|side| open.away[*side]);
                        (open.tabs, away.collect())
                    });
                    What::Kept {
                        pin,
                        favorite: space.is_none(),
                        browser,
                        tabs,
                        away,
                        side,
                    }
                }
            }
        };
        Ok(Subject {
            window,
            place,
            what,
        })
    }

    /// The Browser the item's tabs are in.
    pub fn browser(&self) -> Result<&Browser, String> {
        let browser = match &self.what {
            What::Listed { browser, .. }
            | What::Group { browser, .. }
            | What::Marked { browser, .. } => Some(browser),
            What::Kept { browser, .. } | What::MarkedPins { browser, .. } => browser.as_ref(),
            What::Folder(_) => None,
        };
        browser.ok_or_else(|| "The window has no tabs.".into())
    }

    /// The Chromium tab that was pressed: a list's tab, or an open kept
    /// tab's on the side pressed.
    pub fn tab(&self) -> Option<BrowserTab> {
        match &self.what {
            What::Listed { tab, .. } => Some(*tab),
            What::Kept { tabs, side, .. } => tabs.get(*side).or(tabs.first()).copied(),
            What::Folder(_)
            | What::Group { .. }
            | What::Marked { .. }
            | What::MarkedPins { .. } => None,
        }
    }

    /// The sides of a kept tab that are away from its pages.
    pub fn away(&self) -> &[usize] {
        match &self.what {
            What::Kept { away, .. } => away,
            _ => &[],
        }
    }
}

/// Does `chosen` of `subject`'s menu, then calls `done` with what that did,
/// or why it did not. A space without a Browser gets one first to open a
/// pin in, so `done` may be called later. What is the page's to do is
/// nothing here: renaming, and asking before a folder is deleted.
pub fn choose(
    state: &Rc<State>,
    mt: MainThread,
    subject: Subject,
    chosen: &str,
    done: impl FnOnce(Result<Did, String>) + 'static,
) {
    let keeping = match keeping(state, &subject.what, chosen) {
        Ok(keeping) => keeping,
        Err(error) => return done(Err(error)),
    };
    if let Some(Keeping {
        items,
        target,
        made,
    }) = keeping
    {
        let to = Destination {
            space: None,
            target,
        };
        return move_items(state, mt, subject.window, items, to, move |moved| {
            done(moved.map(|moved| Did {
                folder: made,
                moved,
            }));
        });
    }
    if let (What::Kept { pin, .. }, command::OPEN) = (&subject.what, chosen) {
        return match state.windows.get(subject.window) {
            Some(window) => pins::open_in(state, mt, &window, pin.id, |opened| {
                done(opened.map(|()| Did::default()));
            }),
            None => done(Err("The window is closing.".into())),
        };
    }
    done(act(state, mt, &subject, chosen).map(|folder| Did {
        folder,
        ..Did::default()
    }));
}

// Does what is done at once, and answers the folder New Folder made.
fn act(
    state: &State,
    mt: MainThread,
    subject: &Subject,
    chosen: &str,
) -> Result<Option<PinId>, String> {
    // What acts on the Chromium tab pressed, a list's and a pin's alike.
    if let Some(tab) = subject.tab()
        && on_tab(tab, chosen)?
    {
        return Ok(None);
    }
    match &subject.what {
        What::Listed { browser, tab } => on_listed(mt, browser, *tab, chosen)?,
        What::Kept { pin, side, .. } => return on_kept(state, subject, pin, *side, chosen),
        What::Folder(pin) => return on_pin(state, pin, chosen),
        What::Group { browser, group } => on_group(mt, browser, *group, chosen)?,
        What::Marked { browser, tabs } => on_marked(mt, browser, tabs, chosen)?,
        What::MarkedPins { pins, browser, .. } => {
            on_marked_pins(state, browser.as_ref(), pins, chosen)?;
        }
    }
    Ok(None)
}

// What a command that keeps an item, or keeps it elsewhere, moves, and
// where to: a move, as a drop is. Marked rows go together, in their order.
struct Keeping {
    items: Vec<ItemRef>,
    target: Target,
    /// The folder made for the items, which the page then names.
    made: Option<PinId>,
}

// The move `chosen` is, of `what`, if it is one: first among the space's
// pins, last among the favourites, or last in a folder, one of the space's
// or one made where the first of the marked pinned tabs is.
fn keeping(state: &State, what: &What, chosen: &str) -> Result<Option<Keeping>, String> {
    let tabs_of = |tabs: &[BrowserTab]| -> Vec<ItemRef> {
        tabs.iter().map(|tab| ItemRef::Tab(tab.id())).collect()
    };
    let pins_of =
        |pins: &[PinId]| -> Vec<ItemRef> { pins.iter().copied().map(ItemRef::Pin).collect() };
    let first_pinned = Target::Pinned {
        folder: None,
        index: Some(0),
    };
    let last_favorite = Target::Favorites { index: None };
    let last_in = |folder| Target::Pinned {
        folder: Some(folder),
        index: None,
    };
    let (items, target, made) = match (what, chosen) {
        (What::Listed { tab, .. }, command::PIN_TAB) => (tabs_of(&[*tab]), first_pinned, None),
        (What::Listed { tab, .. }, command::ADD_FAVORITE) => {
            (tabs_of(&[*tab]), last_favorite, None)
        }
        (What::Marked { tabs, .. }, command::PIN_TAB) => (tabs_of(tabs), first_pinned, None),
        (What::Marked { tabs, .. }, command::ADD_FAVORITE) => (tabs_of(tabs), last_favorite, None),
        (What::Kept { pin, .. }, command::TO_SPACE) => (pins_of(&[pin.id]), first_pinned, None),
        (What::Kept { pin, .. }, command::TO_FAVORITES) => {
            (pins_of(&[pin.id]), last_favorite, None)
        }
        (What::MarkedPins { pins, .. }, command::TO_FAVORITES) => {
            (pins_of(pins), last_favorite, None)
        }
        (What::MarkedPins { pins, .. }, command::NEW_FOLDER) => {
            let first = pins.first().ok_or("No pinned tab is marked.")?;
            let folder = new_folder_at(state, *first, 0)?;
            (pins_of(pins), last_in(folder), Some(folder))
        }
        (What::MarkedPins { pins, .. }, _) => {
            let folder = chosen.strip_prefix(command::JOIN_FOLDER);
            match folder.and_then(|id| id.parse().ok()) {
                Some(folder) => (pins_of(pins), last_in(folder), None),
                None => return Ok(None),
            }
        }
        _ => return Ok(None),
    };
    Ok(Some(Keeping {
        items,
        target,
        made,
    }))
}

// A pin of `space` that is a pinned tab, or a split of two: not a folder,
// and not a favourite.
fn pinned_tab(state: &State, space: SpaceId, id: PinId) -> Result<PinId, String> {
    let (_, of, pin) = state.db.pin(id)?.ok_or("That pin is gone.")?;
    if of != Some(space) || matches!(pin.kind, PinKind::Folder { .. }) {
        return Err("Only pinned tabs of the space are marked together.".into());
    }
    Ok(id)
}

// The folders among `rows` and in them, each by its ID and its name.
fn folders_in(rows: Vec<PinRow>, folders: &mut Vec<(PinId, String)>) {
    for row in rows {
        if let PinKind::Folder { items, .. } = row.kind {
            folders.push((row.id, row.name.unwrap_or_default()));
            folders_in(items, folders);
        }
    }
}

// Whether `chosen` was one of these, done.
fn on_tab(tab: BrowserTab, chosen: &str) -> Result<bool, String> {
    let split = tabs::split_of(tab);
    let done = match chosen {
        command::RELOAD => tab.reload(),
        command::MUTE => tab.state().and_then(|state| tab.set_muted(!state.muted)),
        command::SWAP => split.map_or(Ok(()), |split| split.swap_tabs()),
        command::LAYOUT => split.map_or(Ok(()), |split| {
            let stacked = split.state()?.layout == SplitLayout::Stacked;
            split.set_layout(if stacked {
                SplitLayout::SideBySide
            } else {
                SplitLayout::Stacked
            })
        }),
        _ => return Ok(false),
    };
    done.map(|()| true).map_err(failed)
}

fn on_listed(
    mt: MainThread,
    browser: &Browser,
    tab: BrowserTab,
    chosen: &str,
) -> Result<(), String> {
    // A split's two are one row: they join a group and leave it together,
    // which keeps the split, and other rows' tabs are the ones that close.
    let row = tabs::with_split(tab);
    let done = match chosen {
        command::COPY_LINK => clipboard::copy_link(
            &tab.url(),
            Some(tab.title()),
            clipboard::is_off_the_record(browser),
        ),
        command::NEW_GROUP => tabs::new_group(mt, browser, &row).map(drop),
        command::LEAVE_GROUP => BrowserTab::ungroup(mt, &row),
        command::SPLIT => match browser.active_tab() {
            Some(active) => active.split_with(tab, SplitLayout::SideBySide).map(drop),
            None => Ok(()),
        },
        command::UNSPLIT => tabs::split_of(tab).map_or(Ok(()), |split| split.unsplit()),
        command::CLOSE => tabs::close(browser, &[tab]),
        command::CLOSE_OTHERS => {
            let mut others = tabs::listed(browser);
            others.retain(|each| !row.contains(each));
            tabs::close(browser, &others)
        }
        command::CLOSE_BELOW => {
            let all = tabs::listed(browser);
            let last = all.iter().rposition(|each| row.contains(each));
            tabs::close(browser, last.map_or(&[][..], |last| &all[last + 1..]))
        }
        _ => match chosen.strip_prefix(command::JOIN_GROUP) {
            Some(id) => match tabs::group(mt, browser, id) {
                Some(group) => group.add(&row),
                None => Ok(()),
            },
            None => Ok(()),
        },
    };
    done.map_err(failed)
}

fn on_kept(
    state: &State,
    subject: &Subject,
    pin: &PinRow,
    side: usize,
    chosen: &str,
) -> Result<Option<PinId>, String> {
    match chosen {
        command::COPY_LINK => {
            let page = page_of(pin, side).ok_or("The pin has no such side.")?;
            let off_the_record = subject.place.is_off_the_record();
            clipboard::copy_link(&page.url, Some(page.title.clone()), off_the_record)
                .map_err(failed)?;
        }
        command::GO_BACK => {
            for side in subject.away() {
                pins::back(subject.browser()?, pin.id, *side)?;
            }
        }
        command::UPDATE_URL => pins::update_url(state, subject.browser()?, pin.id)?,
        command::CLOSE => pins::close(subject.browser()?, pin.id)?,
        command::REMOVE => pins::delete(state, pin.id)?,
        _ => return on_pin(state, pin, chosen),
    }
    Ok(None)
}

// A folder made from a pinned tab's menu or a folder's: in a folder, last,
// and after a pinned tab.
fn on_pin(state: &State, pin: &PinRow, chosen: &str) -> Result<Option<PinId>, String> {
    if chosen != command::NEW_FOLDER {
        return Ok(None);
    }
    let made = match pin.kind {
        PinKind::Folder { .. } => {
            let (space, _, _) = spot(state, pin.id)?;
            pins::new_folder(state, space, Some(pin.id), None)?
        }
        _ => new_folder_at(state, pin.id, 1)?,
    };
    Ok(Some(made))
}

// Makes a folder beside pin `id`, among a space's pins or in the folder it
// is in: in its place, or `after` it by one.
fn new_folder_at(state: &State, id: PinId, after: usize) -> Result<PinId, String> {
    let (space, parent, index) = spot(state, id)?;
    pins::new_folder(state, space, parent, Some(index + after))
}

// Where pin `id` is among a space's pins: the space, the folder it is in,
// and its index there.
fn spot(state: &State, id: PinId) -> Result<(SpaceId, Option<PinId>, usize), String> {
    match state.db.pin_place(id)?.ok_or("That pin is gone.")? {
        (PinPlace::Space { space, parent }, index) => Ok((space, parent, index)),
        _ => Err("A folder can only be among a space's pins.".into()),
    }
}

fn on_group(
    mt: MainThread,
    browser: &Browser,
    group: TabGroup,
    chosen: &str,
) -> Result<(), String> {
    let members = tabs::in_group(browser, group);
    let done = match chosen {
        command::NEW_TAB_IN_GROUP => {
            let after = members
                .last()
                .and_then(|tab| tab.index())
                .map(|index| index + 1);
            browser
                .add_tab("", after, true)
                .and_then(|tab| group.add(&[tab]))
        }
        command::UNGROUP => BrowserTab::ungroup(mt, &members),
        command::CLOSE_GROUP => tabs::close(browser, &members),
        _ => match chosen.strip_prefix(command::COLOR) {
            Some(name) => menus::set_group_color(group, name),
            None => Ok(()),
        },
    };
    done.map_err(failed)
}

// What is done to marked rows at once. Each row goes whole, a split's two
// together, which keeps the split. Close Tabs closes each tab on its own:
// a page that asks to stay keeps its tab, and the others close.
fn on_marked(
    mt: MainThread,
    browser: &Browser,
    tabs: &[BrowserTab],
    chosen: &str,
) -> Result<(), String> {
    let all: Vec<BrowserTab> = tabs.iter().flat_map(|tab| tabs::with_split(*tab)).collect();
    let done = match chosen {
        command::NEW_GROUP => tabs::new_group(mt, browser, &all).map(drop),
        command::CLOSE => tabs::close(browser, &all),
        _ => match chosen.strip_prefix(command::JOIN_GROUP) {
            Some(id) => match tabs::group(mt, browser, id) {
                Some(group) => group.add(&all),
                None => Ok(()),
            },
            None => Ok(()),
        },
    };
    done.map_err(failed)
}

// What is done to marked pinned tabs at once: their tabs closed, which
// leaves them unopened, or the pins removed.
fn on_marked_pins(
    state: &State,
    browser: Option<&Browser>,
    pins: &[PinId],
    chosen: &str,
) -> Result<(), String> {
    for pin in pins {
        match (chosen, browser) {
            (command::CLOSE, Some(browser)) => pins::close(browser, *pin)?,
            (command::REMOVE, _) => pins::delete(state, *pin)?,
            _ => {}
        }
    }
    Ok(())
}

// A kept tab's page on a side: its one, or a split's first or second.
fn page_of(pin: &PinRow, side: usize) -> Option<&PinPage> {
    match (&pin.kind, side) {
        (PinKind::Tab(page), _) => Some(page),
        (PinKind::Split { first, .. }, 0) => Some(first),
        (PinKind::Split { second, .. }, 1) => Some(second),
        _ => None,
    }
}
