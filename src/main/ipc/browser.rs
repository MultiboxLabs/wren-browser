use serde::{Deserialize, Serialize};
use wren::{Browser, BrowserTab, MainThread, TabCrash, TabGroup, TabSplit, TabStatus, WebView};

use super::groups::Group;
use super::splits::Split;
use super::window::page_space;
use super::{MenuAt, WindowRef, failed, menu_call, with_browser, with_window};
use crate::analytics::{Event, SplitFrom, TabFrom};
use crate::app::State;
use crate::clipboard;
use crate::db::{PinId, SpaceId};
use crate::menus::{self, ADD_FAVORITE, Keeps, PIN_TAB};
use crate::pages::icons;
use crate::pins::{self, PinTarget};
use crate::shell::{BrowserWindow, Place};
use crate::tabs::{self, placeholder};

/// A tab as the sidebar draws it. Its favicon comes apart ("tab.favicon").
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Tab {
    id: i32,
    title: String,
    url: String,
    loading: bool,
    can_go_back: bool,
    can_go_forward: bool,
    crashed: bool,
    /// Its group's ID, if it is in one.
    group: Option<String>,
    /// Its split's ID, if it is in one.
    split: Option<String>,
    /// Chromium has pinned it: it is a pin's, and not in the list.
    pinned: bool,
    /// It stands in for the Browser's tabs while it has none: the page
    /// neither lists nor shows it.
    hidden: bool,
}

/// The address of the link under the pointer in a tab's page, or of the
/// link with the keyboard, which the page shows over it ("tab.status").
#[derive(Serialize)]
struct Status {
    tab: i32,
    link: Option<String>,
}

/// The tabs of the Browser in front, in its order, and which is active.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Tabs {
    /// The Browser's ID, which names its side panel's element; none while
    /// the window's space has no Browser.
    browser: Option<i32>,
    /// The space they are the tabs of, so the page never shows them as
    /// another's while it switches; a window on a profile's made-up one.
    space: Option<SpaceId>,
    tabs: Vec<Tab>,
    active: Option<i32>,
    /// The tab whose page has the whole window, if one has.
    full_screen: Option<i32>,
    /// The groups of `tabs`, in their order.
    groups: Vec<Group>,
    /// The splits of `tabs`, in their order.
    splits: Vec<Split>,
    /// The pins open in the Browser, each with its tabs.
    links: Vec<Link>,
}

/// A pin open in the Browser: its tab, or a split pin's two, and whether
/// each is away from the pin's page.
#[derive(Serialize)]
struct Link {
    pin: PinId,
    tabs: Vec<i32>,
    away: Vec<bool>,
}

/// What the page moves, by one of its tabs: the tab, the split it is in, or
/// its group.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
enum Movable {
    Tab(i32),
    Split(i32),
    Group(i32),
}

/// Two tabs to be shown side by side, as the page has them: the left one
/// first.
#[derive(Deserialize)]
struct Pair {
    first: i32,
    second: i32,
}

/// An address dropped on the list, to open where it was dropped.
#[derive(Deserialize)]
struct OpenAt {
    url: String,
    /// Among the list's tabs (`tabs::listed`).
    index: usize,
    /// One of the tabs of the group it opens in, or none.
    group: Option<i32>,
}

#[derive(Deserialize)]
struct MoveTo {
    unit: Movable,
    /// Where its first tab goes, among the list's tabs (`tabs::listed`).
    index: usize,
    /// For a tab: one of the tabs of the group it ends in, or none for no
    /// group. A split or a group stays as it is.
    group: Option<i32>,
}

pub fn handle(web_view: &WebView, window: &WindowRef, mt: MainThread) {
    // The tabs; "browser.tabs" says when they change.
    let weak = window.clone();
    let _ = web_view.handle("browser.tabs", move |()| {
        with_browser(&weak, |window, browser| Ok(tab_list(window, browser)))
    });

    // A tab's favicon's icon ID, or null; "tab.favicon" says when it
    // changes.
    let weak = window.clone();
    let _ = web_view.handle("tab.favicon", move |id: i32| {
        with_browser(&weak, |_, browser| {
            Ok(tab(mt, browser, id)?.favicon_png().map(icons::id))
        })
    });

    // The address of the link under the pointer in a tab's page, or null;
    // "tab.status" says when it changes.
    let weak = window.clone();
    let _ = web_view.handle("tab.status", move |id: i32| {
        with_browser(&weak, |_, browser| Ok(link(tab(mt, browser, id)?)))
    });

    // A tab on an address, at the top of the list.
    let weak = window.clone();
    let _ = web_view.handle("tabs.open", move |url: String| {
        with_browser(&weak, |_, browser| {
            tabs::open(browser, &url).map_err(failed)?;
            let from = TabFrom::Sidebar;
            weak.state()?.analytics.record(Event::TabOpened { from });
            Ok(())
        })
    });

    // The active tab's address, on the clipboard.
    let weak = window.clone();
    let _ = web_view.handle("tabs.copyLink", move |()| {
        with_browser(&weak, |_, browser| {
            let tab = browser.active_tab().ok_or("There is no tab.")?;
            let off_the_record = clipboard::is_off_the_record(browser);
            clipboard::copy_link(&tab.url(), Some(tab.title()), off_the_record).map_err(failed)
        })
    });

    // The ID the tab's picture is served at (`previewUrl`), as it was when
    // last left for another tab (tabs/previews.rs); null for one not left
    // yet.
    let weak = window.clone();
    let _ = web_view.handle("tabs.preview", move |id: i32| {
        with_browser(&weak, |_, browser| {
            Ok(tabs::previews::of(tab(mt, browser, id)?))
        })
    });

    let weak = window.clone();
    let _ = web_view.handle("tabs.activate", move |id: i32| {
        with_browser(&weak, |_, browser| {
            tab(mt, browser, id)?.activate().map_err(failed)
        })
    });

    let weak = window.clone();
    let _ = web_view.handle("tabs.close", move |id: i32| {
        with_browser(&weak, |_, browser| {
            tabs::close(browser, &[tab(mt, browser, id)?]).map_err(failed)?;
            let from = TabFrom::Sidebar;
            weak.state()?.analytics.record(Event::TabClosed { from });
            Ok(())
        })
    });

    // A tab, or its split's or its group's, moved to an index in the list;
    // "browser.tabs" says where it landed.
    let weak = window.clone();
    let _ = web_view.handle("tabs.move", move |to: MoveTo| {
        with_browser(&weak, |_, browser| {
            let (Movable::Tab(id) | Movable::Split(id) | Movable::Group(id)) = to.unit;
            let tab = tab(mt, browser, id)?;
            let state = || tab.state().map_err(failed);
            match to.unit {
                Movable::Tab(_) => {
                    let group = group_of(mt, browser, to.group)?;
                    tabs::move_tab(mt, browser, tab, to.index, group)
                }
                Movable::Split(_) => {
                    let split = state()?.split.ok_or("The tab is in no split.")?;
                    tabs::move_split(browser, split, to.index)
                }
                Movable::Group(_) => {
                    let group = state()?.group.ok_or("The tab is in no group.")?;
                    tabs::move_group(browser, group, to.index)
                }
            }
            .map_err(failed)
        })
    });

    // A web address or a file dropped on the list: a tab on it, where it was
    // dropped.
    let weak = window.clone();
    let _ = web_view.handle("tabs.openAt", move |at: OpenAt| {
        with_browser(&weak, |_, browser| {
            let group = group_of(mt, browser, at.group)?;
            tabs::open_at(mt, browser, &at.url, at.index, group).map_err(failed)?;
            let from = TabFrom::Drop;
            weak.state()?.analytics.record(Event::TabOpened { from });
            Ok(())
        })
    });

    // A tab dropped on the left or right half of another: the two in a
    // split.
    let weak = window.clone();
    let _ = web_view.handle("tabs.split", move |pair: Pair| {
        with_browser(&weak, |_, browser| {
            let first = tab(mt, browser, pair.first)?;
            tabs::split(first, tab(mt, browser, pair.second)?).map_err(failed)?;
            let from = SplitFrom::Tabs;
            weak.state()?.analytics.record(Event::SplitOpened { from });
            Ok(())
        })
    });

    // A tab's context menu, at the point the page names. Answers with what
    // was chosen, once the app has done it, or null.
    let weak = window.clone();
    let _ = web_view.handle_call("tabs.menu", move |call| {
        menu_call(&weak, call, |view, browser, at: MenuAt<i32>, done| {
            let tab = tab(mt, browser, at.id)?;
            let place = with_window(&weak, |found| Ok(found.place_of(browser)))?;
            let keeps = Keeps {
                favorites: place
                    .as_ref()
                    .is_some_and(|place| !place.is_off_the_record()),
                pins: place.as_ref().and_then(Place::space).is_some(),
            };
            let (weak, owner) = (weak.clone(), browser.clone());
            let done = move |chosen: Option<String>| {
                if let (Some(place), Ok(state)) = (&place, weak.state()) {
                    keep_chosen(&state, &owner, place, tab, chosen.as_deref());
                }
                done(chosen);
            };
            menus::show_tab_menu(mt, view, browser, tab, (at.x, at.y), keeps, done).map_err(failed)
        })
    });

    // Back, forward, reload and stop, in the active tab.
    for (name, run) in [
        ("tabs.back", BrowserTab::go_back as fn(BrowserTab) -> _),
        ("tabs.forward", BrowserTab::go_forward),
        ("tabs.reload", BrowserTab::reload),
        ("tabs.stop", BrowserTab::stop),
    ] {
        let weak = window.clone();
        let _ = web_view.handle(name, move |()| {
            with_browser(&weak, |_, browser| {
                let tab = browser.active_tab().ok_or("There is no tab.")?;
                run(tab).map_err(failed)
            })
        });
    }
}

/// Tells the page the tabs changed: which there are, their order, a tab's
/// title, address, or state, or which is active.
pub fn send_tabs(window: &BrowserWindow, browser: &Browser) {
    let _ = window
        .page
        .web_view
        .send("browser.tabs", &tab_list(window, browser));
}

/// Tells the page there are no tabs: its space has no Browser.
pub fn send_no_tabs(window: &BrowserWindow) {
    let none = Tabs {
        browser: None,
        space: page_space(window.place()),
        tabs: Vec::new(),
        active: None,
        full_screen: None,
        groups: Vec::new(),
        splits: Vec::new(),
        links: Vec::new(),
    };
    let _ = window.page.web_view.send("browser.tabs", &none);
}

/// Tells the page a tab's favicon changed, for it to ask again.
pub fn send_favicon(window: &BrowserWindow, tab: BrowserTab) {
    let _ = window.page.web_view.send("tab.favicon", &tab.id());
}

/// Tells the page the link under the pointer in a tab's page changed.
pub fn send_status(window: &BrowserWindow, tab: BrowserTab) {
    let status = Status {
        tab: tab.id(),
        link: link(tab),
    };
    let _ = window.page.web_view.send("tab.status", &status);
}

// The address of the link Chrome's status bubble shows for a tab, if it
// shows one; not its loading line.
fn link(tab: BrowserTab) -> Option<String> {
    tab.state()
        .is_ok_and(|state| state.status == TabStatus::Link)
        .then(|| tab.status_text())
        .filter(|text| !text.is_empty())
}

fn tab_list(window: &BrowserWindow, browser: &Browser) -> Tabs {
    let mut groups: Vec<TabGroup> = Vec::new();
    let mut splits: Vec<TabSplit> = Vec::new();
    let tabs = browser
        .tabs()
        .into_iter()
        .map(|tab| {
            let state = tab.state().ok();
            let group = state.and_then(|state| state.group);
            if let Some(group) = group.filter(|group| !groups.contains(group)) {
                groups.push(group);
            }
            let split = state.and_then(|state| state.split);
            if let Some(split) = split.filter(|split| !splits.contains(split)) {
                splits.push(split);
            }
            Tab {
                id: tab.id(),
                title: tab.title(),
                url: tab.url(),
                loading: state.is_some_and(|state| state.loading),
                can_go_back: state.is_some_and(|state| state.can_go_back),
                can_go_forward: state.is_some_and(|state| state.can_go_forward),
                crashed: state.is_some_and(|state| state.crash != TabCrash::None),
                group: group.map(|group| group.to_string()),
                split: split.map(|split| split.to_string()),
                pinned: state.is_some_and(|state| state.pinned),
                hidden: placeholder::is_placeholder(tab),
            }
        })
        .collect();
    Tabs {
        browser: Some(browser.id()),
        space: page_space(window.place_of(browser)),
        tabs,
        active: browser.active_tab().map(BrowserTab::id),
        full_screen: browser.fullscreen_tab().map(BrowserTab::id),
        groups: groups.into_iter().map(Group::new).collect(),
        splits: splits.into_iter().filter_map(Split::new).collect(),
        links: links(browser),
    }
}

// The pins open in the Browser, by their tabs' IDs of this launch.
fn links(browser: &Browser) -> Vec<Link> {
    pins::open_pins(browser)
        .into_iter()
        .map(|open| Link {
            pin: open.pin,
            tabs: open.tabs.into_iter().map(BrowserTab::id).collect(),
            away: open.away,
        })
        .collect()
}

// Pins `tab` as Pin Tab or Add to Favourites, chosen from its menu, would:
// first among the space's pins, or last among the favourites.
fn keep_chosen(
    state: &State,
    browser: &Browser,
    place: &Place,
    tab: BrowserTab,
    chosen: Option<&str>,
) {
    let (target, index) = match chosen {
        Some(PIN_TAB) => (PinTarget::Space { parent: None }, Some(0)),
        Some(ADD_FAVORITE) => (PinTarget::Favorites, None),
        _ => return,
    };
    if let Err(error) = pins::pin_tab(state, browser, place, tab, target, index) {
        eprintln!("Wren kept no pin: {error}");
    }
}

// The group of the tab the page names, if it names one: the group a tab is to
// be in.
pub(super) fn group_of(
    mt: MainThread,
    browser: &Browser,
    member: Option<i32>,
) -> Result<Option<TabGroup>, String> {
    let Some(member) = member else {
        return Ok(None);
    };
    let state = tab(mt, browser, member)?.state().map_err(failed)?;
    Ok(Some(state.group.ok_or("The tab is in no group.")?))
}

// The tab an ID from the page names, if it is the Browser's.
pub(super) fn tab(mt: MainThread, browser: &Browser, id: i32) -> Result<BrowserTab, String> {
    BrowserTab::from_id(mt, id)
        .filter(|tab| tab.browser().as_ref() == Some(browser))
        .ok_or_else(|| "There is no such tab.".into())
}
