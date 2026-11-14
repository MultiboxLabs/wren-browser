// The pins that are open: for each, what it keeps of its pages while a tab
// is open for it, and its tabs in a Browser, of which a window has one at
// most (`opening_near`).
//
// Which tab is open for which pin is the tab's claim (tabs/roles.rs), and
// nothing here keeps it again: a pin's tabs in a Browser (`Opening`) are
// worked out from the claims each time. What a pin keeps (`Kept`) is held
// once for each pin, whichever Browsers it is open in, as its row in the
// database has it, so the tabs' changes are compared against it without
// reading the row each time. The functions here that write a pin's row are
// the only ones that do while it is open, and each writes `Kept` with it.

use std::cell::RefCell;
use std::collections::HashMap;

use wren::{Browser, BrowserTab, Error, ProfileKind, SplitLayout};

use super::pin_layout;
use crate::app::State;
use crate::db::{PinId, PinPage, PinPlace, SpaceId};
use crate::shell::Place;
use crate::tabs::roles::{self, Claim};

/// Whose an open pin is: the favourites of a profile, which every place of
/// that profile shows, or the pins of one space.
#[derive(Clone, Debug, PartialEq)]
pub enum Owner {
    Favorites { profile: String },
    Space(SpaceId),
}

impl Owner {
    // The owner of a pin at `place` in the database.
    fn of(place: PinPlace) -> Owner {
        match place {
            PinPlace::Favorites { profile } => Owner::Favorites { profile },
            PinPlace::Space { space, .. } => Owner::Space(space),
        }
    }

    /// Whether `browser`, a window's Browser for `place`, shows its pins.
    pub fn is_shown_in(&self, browser: &Browser, place: &Place) -> bool {
        match self {
            Owner::Space(space) => place.space() == Some(*space),
            Owner::Favorites { profile } => browser.profile().is_some_and(|of| {
                of.kind() != ProfileKind::OffTheRecord && of.original().id() == *profile
            }),
        }
    }
}

/// What an open pin keeps, as its row in the database has it.
#[derive(Clone, Debug)]
pub struct Kept {
    /// Whose it is; None if its row could not be read as it opened.
    pub owner: Option<Owner>,
    /// Its page, or a split pin's two, in its order. A tab is away once it
    /// leaves its page's address.
    pub pages: Vec<PinPage>,
    /// A split pin's layout and ratio.
    pub split: Option<(SplitLayout, f64)>,
    /// When its tabs were last active; None until it is first kept
    /// (`keep_active` in settle.rs).
    pub last_active: Option<i64>,
}

thread_local! {
    static KEPT: RefCell<HashMap<PinId, Kept>> = RefCell::default();
}

/// What open pin `pin` keeps; None for a pin with no tab open.
pub fn kept(pin: PinId) -> Option<Kept> {
    KEPT.with(|kept| kept.borrow().get(&pin).cloned())
}

/// Forgets what the pins with no tab open any more kept.
pub fn forget_unopened() {
    let open = roles::claimed_pins();
    KEPT.with(|kept| kept.borrow_mut().retain(|pin, _| open.contains(pin)));
}

/// A pin's tabs in one Browser.
#[derive(Clone, Debug)]
pub struct Opening {
    pub pin: PinId,
    /// Its tab on each side, in the pin's order: one for a tab pin, two for
    /// a split pin. None for a side whose tab has closed.
    pub sides: Vec<Option<BrowserTab>>,
    /// Its tabs are closing (`Claim::closing`).
    pub closing: bool,
}

impl Opening {
    /// Its tabs that are open, in the pin's order.
    pub fn tabs(&self) -> Vec<BrowserTab> {
        self.sides.iter().flatten().copied().collect()
    }

    /// Its tabs if every side has one, in the pin's order.
    pub fn whole(&self) -> Option<Vec<BrowserTab>> {
        self.sides.iter().copied().collect()
    }
}

/// The pins open in the Browser, in the order of their first tabs there.
/// Of two tabs that claim one side, the first is the pin's.
pub fn openings(browser: &Browser) -> Vec<Opening> {
    let mut openings: Vec<Opening> = Vec::new();
    for (tab, claim) in roles::claims(browser) {
        let at = match openings.iter().position(|each| each.pin == claim.pin) {
            Some(at) => at,
            None => {
                openings.push(Opening {
                    pin: claim.pin,
                    sides: vec![None; sides_of(claim.pin)],
                    closing: false,
                });
                openings.len() - 1
            }
        };
        let opening = &mut openings[at];
        if opening.sides.len() <= claim.side {
            opening.sides.resize(claim.side + 1, None);
        }
        opening.sides[claim.side].get_or_insert(tab);
        opening.closing |= claim.closing;
    }
    openings
}

/// The pin's tabs in the Browser, if it is open there.
pub fn opening(browser: &Browser, pin: PinId) -> Option<Opening> {
    openings(browser).into_iter().find(|each| each.pin == pin)
}

/// The pin's tabs in `browser`, or else in another Browser of its window,
/// with that Browser; not tabs closing there, which are as good as gone. A
/// window has one opening of a pin at most: a favourite's tab moves to the
/// space that opens it, and a space's pin is shown by that space's Browser
/// alone. Other windows have their own.
pub fn opening_near(state: &State, browser: &Browser, pin: PinId) -> Option<(Browser, Opening)> {
    if let Some(opening) = opening(browser, pin) {
        return Some((browser.clone(), opening));
    }
    let window = state.windows.of(browser)?;
    roles::claims_of(pin)
        .into_iter()
        .filter_map(|(tab, _)| tab.browser())
        .find(|other| window.has_browser(other))
        .and_then(|other| {
            let found = opening(&other, pin).filter(|opening| !opening.closing)?;
            Some((other, found))
        })
}

// How many sides a pin has, as it keeps them: at least one.
fn sides_of(pin: PinId) -> usize {
    KEPT.with(|kept| {
        kept.borrow()
            .get(&pin)
            .map_or(1, |kept| kept.pages.len().max(1))
    })
}

/// Opens `pin` on tabs of `browser`, each for the page beside it, in the
/// pin's order: they claim their sides, and a split pin's two are made a
/// split of `split`'s layout and ratio. The tabs are in no split as it is
/// called. A tab the pin had open in the Browser that is not among them is
/// a tab of the list again. The pin keeps the pages, in place of what it
/// kept.
pub fn link(
    state: &State,
    browser: &Browser,
    pin: PinId,
    sides: Vec<(BrowserTab, PinPage)>,
    split: Option<(SplitLayout, f64)>,
) -> Result<(), Error> {
    for (tab, _) in roles::claims(browser) {
        if roles::pin_of(tab) == Some(pin) && !sides.iter().any(|(side, _)| *side == tab) {
            roles::release(tab);
        }
    }
    let tabs: Vec<BrowserTab> = sides.iter().map(|(tab, _)| *tab).collect();
    let owner = owner_of(state, pin);
    KEPT.with(|kept| {
        let mut kept = kept.borrow_mut();
        let last_active = kept.get(&pin).and_then(|kept| kept.last_active);
        let pages = sides.into_iter().map(|(_, page)| page).collect();
        kept.insert(
            pin,
            Kept {
                owner,
                pages,
                split,
                last_active,
            },
        );
    });
    for (side, tab) in tabs.iter().enumerate() {
        roles::claim(*tab, pin, side)?;
    }
    if let (Some((layout, ratio)), [first, second]) = (split, tabs.as_slice()) {
        first.split_with(*second, layout)?.set_ratio(ratio, false)?;
    }
    Ok(())
}

// Whose `pin` is, as its row has it.
fn owner_of(state: &State, pin: PinId) -> Option<Owner> {
    let place = state.db.pin_place(pin).ok().flatten()?;
    Some(Owner::of(place.0))
}

/// Pin `pin` has moved: an open one keeps whose it is now.
pub fn moved(state: &State, pin: PinId) {
    let owner = owner_of(state, pin);
    keep(pin, |kept| kept.owner = owner);
}

/// Marks the pin's tabs in the Browser as closing, or no longer.
pub fn set_closing(browser: &Browser, pin: PinId, closing: bool) {
    for (tab, claim) in roles::claims(browser) {
        if claim.pin == pin {
            roles::update_claim(tab, |claim| claim.closing = closing);
        }
    }
}

// Changes what open pin `pin` keeps, once its row is written.
fn keep(pin: PinId, change: impl FnOnce(&mut Kept)) {
    KEPT.with(|kept| {
        if let Some(kept) = kept.borrow_mut().get_mut(&pin) {
            change(kept);
        }
    });
}

/// Makes the pin's page on `side` another: its address, title and favicon.
pub fn set_page(state: &State, pin: PinId, side: usize, page: &PinPage) -> Result<(), String> {
    state.db.set_pin_page(pin, side, page)?;
    keep(pin, |kept| {
        if let Some(kept) = kept.pages.get_mut(side) {
            *kept = page.clone();
        }
    });
    Ok(())
}

/// Keeps the title and favicon of the pin's page on `side`.
pub fn set_look(
    state: &State,
    pin: PinId,
    side: usize,
    title: String,
    favicon: Option<Vec<u8>>,
) -> Result<(), String> {
    state
        .db
        .set_pin_look(pin, side, &title, favicon.as_deref())?;
    keep(pin, |kept| {
        if let Some(page) = kept.pages.get_mut(side) {
            page.title = title;
            page.favicon = favicon;
        }
    });
    Ok(())
}

/// Keeps a split pin's layout and ratio, and its sides the other way round
/// if `swapped`: its pages, and with them the side each of its tabs is open
/// for, in every Browser.
pub fn set_split(
    state: &State,
    pin: PinId,
    layout: SplitLayout,
    ratio: f64,
    swapped: bool,
) -> Result<(), String> {
    state
        .db
        .set_pin_split(pin, pin_layout(layout), ratio, swapped)?;
    keep(pin, |kept| {
        kept.split = Some((layout, ratio));
        if swapped {
            kept.pages.reverse();
        }
    });
    if swapped {
        for (tab, _) in roles::claims_of(pin) {
            roles::update_claim(tab, |claim: &mut Claim| claim.side = 1 - claim.side.min(1));
        }
    }
    Ok(())
}

/// Keeps when the pin's tabs were last active.
pub fn set_active(state: &State, pin: PinId, at: i64) -> Result<(), String> {
    state.db.set_pin_active(pin, at)?;
    keep(pin, |kept| kept.last_active = Some(at));
    Ok(())
}

/// Makes a split pin a tab pin of its page on `side`, which `tab` stays
/// open for.
pub fn split_to_tab(state: &State, pin: PinId, side: usize, tab: BrowserTab) -> Result<(), String> {
    state.db.split_to_tab(pin, side)?;
    keep(pin, |kept| {
        if side < kept.pages.len() {
            kept.pages = vec![kept.pages.swap_remove(side)];
        }
        kept.split = None;
    });
    roles::update_claim(tab, |claim| claim.side = 0);
    Ok(())
}
