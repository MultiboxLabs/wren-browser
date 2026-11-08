// The page's tabs: each of the window's Browsers' tabs, in order, with their
// groups, splits and open pins, which the page asks for once ("browser.tabs")
// and is sent again as they change (changes.rs). src/renderer/ipc/tabs.ts is
// the page's side. The calls that act on tabs are in browser.rs.

use serde::Serialize;
use wren::{Browser, BrowserTab, TabAlert, TabCrash, TabGroup, TabSplit, WebView};

use super::groups::Group;
use super::splits::Split;
use super::window::page_space;
use super::{WindowRef, with_window};
use crate::db::{PinId, SpaceId};
use crate::pins;
use crate::shell::{BrowserWindow, Place};
use crate::tabs::placeholder;

/// A tab as the sidebar draws it.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Tab {
    id: i32,
    title: String,
    url: String,
    /// Its favicon's icon ID (`iconUrl`), if it has one.
    favicon: Option<String>,
    loading: bool,
    can_go_back: bool,
    can_go_forward: bool,
    crashed: bool,
    /// Its page captures a window or a screen.
    capturing_screen: bool,
    /// Something captures its page, such as a call it is shared to.
    being_captured: bool,
    /// Its page records from the camera.
    camera: bool,
    /// Its page records from the microphone.
    microphone: bool,
    /// Its page plays sound, or just did, muted or not.
    audible: bool,
    /// Its sound is muted.
    muted: bool,
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

/// The tabs of one of the window's Browsers, in its order, and which is
/// active.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Tabs {
    /// The Browser's ID, which names its side panel's element; none while
    /// the window's space has no Browser.
    browser: Option<i32>,
    /// The space they are the tabs of, so the page never shows them as
    /// another's while it switches; a window on a profile's made-up one.
    space: Option<SpaceId>,
    /// They are the tabs of the place in front, which the window shows. The
    /// page takes the last tabs said so as the window's, as they come
    /// before the window says it is on their space.
    front: bool,
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

pub fn handle(web_view: &WebView, window: &WindowRef) {
    // The tabs of each of the window's Browsers, and none for its place in
    // front if that has no Browser and none on the way; "browser.tabs"
    // says when one's change.
    let weak = window.clone();
    let _ = web_view.handle("browser.tabs", move |()| {
        with_window(&weak, |window| Ok(every_tab_list(window)))
    });
}

/// Tells the page the tabs changed: which there are, their order, a tab's
/// title, address, or state, or which is active.
pub fn send_tabs(window: &BrowserWindow, browser: &Browser) {
    send_counted(window, "browser.tabs", &tab_list(window, browser));
}

/// Tells the page there are no tabs: its space has no Browser.
pub fn send_no_tabs(window: &BrowserWindow) {
    let tabs = no_tabs(page_space(window.place()), true);
    send_counted(window, "browser.tabs", &tabs);
}

/// Tells the page that `place`, behind the one in front, has no tabs: its
/// Browser has closed.
pub fn send_no_tabs_for(window: &BrowserWindow, place: &Place) {
    let tabs = no_tabs(page_space(Some(place.clone())), false);
    send_counted(window, "browser.tabs", &tabs);
}

// Sends the page a message of its tabs, whose size a performance run counts.
fn send_counted<V: Serialize>(window: &BrowserWindow, name: &str, value: &V) {
    let Ok(json) = serde_json::to_string(value) else {
        return;
    };
    if let Some(counts) = &window.perf_counts {
        counts.sent(json.len());
    }
    let _ = window.page.web_view.send_json(name, Some(&json));
}

// The tabs of a space without a Browser, in front or not.
fn no_tabs(space: Option<SpaceId>, front: bool) -> Tabs {
    Tabs {
        browser: None,
        space,
        front,
        tabs: Vec::new(),
        active: None,
        full_screen: None,
        groups: Vec::new(),
        splits: Vec::new(),
        links: Vec::new(),
    }
}

// The tabs of each of the window's Browsers. Its place in front without
// one has none, unless one is on the way: the page waits for its tabs.
fn every_tab_list(window: &BrowserWindow) -> Vec<Tabs> {
    let mut every: Vec<Tabs> = window
        .browsers()
        .iter()
        .map(|browser| tab_list(window, browser))
        .collect();
    if let Some(place) = window.place()
        && window.browser().is_none()
        && !window.is_opening(&place)
    {
        every.push(no_tabs(page_space(Some(place)), true));
    }
    every
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
            let alert = |alert| state.is_some_and(|state| state.alert_set().contains(alert));
            Tab {
                id: tab.id(),
                title: tab.title(),
                url: tab.url(),
                favicon: window.page_tabs.favicon(tab),
                loading: state.is_some_and(|state| state.loading),
                can_go_back: state.is_some_and(|state| state.can_go_back),
                can_go_forward: state.is_some_and(|state| state.can_go_forward),
                crashed: state.is_some_and(|state| state.crash != TabCrash::None),
                capturing_screen: alert(TabAlert::CAPTURING_SCREEN),
                being_captured: alert(TabAlert::BEING_CAPTURED),
                camera: alert(TabAlert::CAMERA),
                microphone: alert(TabAlert::MICROPHONE),
                audible: alert(TabAlert::AUDIBLE),
                muted: state.is_some_and(|state| state.muted),
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
        front: window.is_front(browser),
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
