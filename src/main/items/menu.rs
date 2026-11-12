// What an item's menu is for, and what each of its commands does. The page
// names an item and the side of it that was pressed (ipc/items.rs); this
// finds it in the window (`Subject`), menus/item.rs builds its menu, and
// `choose` does what is chosen. Keeping a tab, or keeping it elsewhere, is
// a move like a drop's (`move_item`).

use std::rc::Rc;

use wren::{Browser, BrowserTab, MainThread, SplitLayout, TabGroup};

use super::{Destination, ItemRef, Moved, Target, failed, move_item, tab_of};
use crate::app::State;
use crate::clipboard;
use crate::db::{PinId, PinKind, PinPage, PinPlace, PinRow};
use crate::menus::{self, item as command};
use crate::pins::{self, PinTarget};
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
    Listed { browser: Browser, tab: BrowserTab },
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
    Group { browser: Browser, group: TabGroup },
}

/// What a choice did: the folder New Folder made, for the page to name, and
/// what a move did, for what counts it.
#[derive(Default)]
pub struct Did {
    pub folder: Option<PinId>,
    pub moved: Option<Moved>,
}

impl Subject {
    /// The item the page names in `window`, pressed on `side`.
    pub fn find(
        state: &State,
        mt: MainThread,
        window: WindowId,
        item: &ItemRef,
        side: usize,
    ) -> Result<Subject, String> {
        let found = state.windows.get(window).ok_or("The window is closing.")?;
        let place = found.place().ok_or("The window is on no space.")?;
        let browser = found.browser();
        let shown = || browser.clone().ok_or("The window has no tabs.");
        let what = match item {
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
            What::Listed { browser, .. } | What::Group { browser, .. } => Some(browser),
            What::Kept { browser, .. } => browser.as_ref(),
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
            What::Folder(_) | What::Group { .. } => None,
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
    // Keeping a tab, or keeping a pin elsewhere, is a move: a tab first
    // among the space's pins or last among the favourites, and a pin the
    // same.
    let kept = match (&subject.what, chosen) {
        (What::Listed { tab, .. }, command::PIN_TAB | command::ADD_FAVORITE) => {
            Some(ItemRef::Tab(tab.id()))
        }
        (What::Kept { pin, .. }, command::TO_SPACE | command::TO_FAVORITES) => {
            Some(ItemRef::Pin(pin.id))
        }
        _ => None,
    };
    if let Some(item) = kept {
        let target = match chosen {
            command::PIN_TAB | command::TO_SPACE => Target::Pinned {
                folder: None,
                index: Some(0),
            },
            _ => Target::Favorites { index: None },
        };
        let to = Destination {
            space: None,
            target,
        };
        return move_item(state, mt, subject.window, item, to, |moved| {
            done(moved.map(|moved| Did {
                moved: Some(moved),
                ..Did::default()
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
        What::Folder(pin) => return on_pin(state, subject, pin, chosen),
        What::Group { browser, group } => on_group(mt, browser, *group, chosen)?,
    }
    Ok(None)
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
        command::MOVE_UP => tabs::move_by(mt, browser, tab, -1),
        command::MOVE_DOWN => tabs::move_by(mt, browser, tab, 1),
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
        _ => return on_pin(state, subject, pin, chosen),
    }
    Ok(None)
}

// What a pinned tab and a folder share: a place up or down among those
// beside it, and a new folder, in a folder last, or after a pinned tab.
fn on_pin(
    state: &State,
    subject: &Subject,
    pin: &PinRow,
    chosen: &str,
) -> Result<Option<PinId>, String> {
    if !matches!(
        chosen,
        command::MOVE_UP | command::MOVE_DOWN | command::NEW_FOLDER
    ) {
        return Ok(None);
    }
    let (found, index) = state.db.pin_place(pin.id)?.ok_or("That pin is gone.")?;
    let PinPlace::Space { space, parent } = found else {
        return Err("Only a space's pins have a place up or down, or a folder.".into());
    };
    if chosen == command::NEW_FOLDER {
        let made = match pin.kind {
            PinKind::Folder { .. } => pins::new_folder(state, space, Some(pin.id), None)?,
            _ => pins::new_folder(state, space, parent, Some(index + 1))?,
        };
        return Ok(Some(made));
    }
    // Its index among the others, which is one less than among them all
    // for those after it.
    let to = match chosen {
        command::MOVE_UP => index.checked_sub(1).ok_or("It is the first.")?,
        _ => index + 1,
    };
    let target = PinTarget::Space { parent };
    pins::move_pin(state, &subject.place, pin.id, target, Some(to))?;
    Ok(None)
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

// A kept tab's page on a side: its one, or a split's first or second.
fn page_of(pin: &PinRow, side: usize) -> Option<&PinPage> {
    match (&pin.kind, side) {
        (PinKind::Tab(page), _) => Some(page),
        (PinKind::Split { first, .. }, 0) => Some(first),
        (PinKind::Split { second, .. }, 1) => Some(second),
        _ => None,
    }
}
