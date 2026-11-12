// The page's tabs: each of the window's Browsers' tabs, in order, with their
// groups, splits and open pins, which the page asks for once ("browser.tabs").
// As Chromium changes them (changes.rs), each batch of changes tells the page
// what it changed of each Browser (`TabChanges`): the tabs that changed, or
// which tab is active, or the whole list again when its structure or order
// changed. src/renderer/ipc/tabs.ts is the page's side. The calls that act on
// tabs are in browser.rs.

use serde::Serialize;
use wren::{
    Browser, BrowserTab, Change, ChangeKind, TabAlert, TabCrash, TabFields, TabGroup, TabSplit,
    TabState, WebView,
};

use super::groups::Group;
use super::splits::Split;
use super::window::page_space;
use super::{WindowRef, with_window};
use crate::db::{PinId, SpaceId};
use crate::pins;
use crate::shell::{BrowserWindow, Place};
use crate::tabs::roles::{self, Role};

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
    /// Where the page draws it.
    role: PageRole,
}

/// Where the page draws a tab, from what the tab is (tabs/roles.rs). Every
/// tab is `Listed` unless its role says otherwise, so none is left out of
/// the list by mistake.
#[derive(Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
enum PageRole {
    /// In the sidebar's list.
    Listed,
    /// On the row of the pin it is open for (`Link`).
    Pin,
    /// Nowhere: the placeholder, which stands in while the Browser has no
    /// tabs, or a tab closing for a pin that has gone.
    Hidden,
}

impl PageRole {
    fn of(tab: BrowserTab) -> PageRole {
        match roles::of(tab) {
            Role::Listed => PageRole::Listed,
            Role::Pin(_) => PageRole::Pin,
            Role::Placeholder | Role::Leaving => PageRole::Hidden,
        }
    }
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

/// What "browser.tabsChanged" says: tabs of one of the window's Browsers
/// whose fields changed, each whole, and its open pins, which a tab's
/// address changes (`Link::away`).
#[derive(Serialize)]
struct TabsChanged {
    /// The space they are the tabs of, as `Tabs::space`.
    space: Option<SpaceId>,
    tabs: Vec<Tab>,
    links: Vec<Link>,
}

/// What "browser.activeChanged" says: another tab of one of the window's
/// Browsers became active, the order of its tabs as it was.
#[derive(Serialize)]
struct ActiveChanged {
    /// The space they are the tabs of, as `Tabs::space`.
    space: Option<SpaceId>,
    active: Option<i32>,
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

/// The fields of a tab the list draws.
fn drawn() -> TabFields {
    TabFields::TITLE
        | TabFields::URL
        | TabFields::FAVICON
        | TabFields::LOADING
        | TabFields::HISTORY
        | TabFields::CRASHED
        | TabFields::ALERTS
        | TabFields::MUTED
        | structure()
}

/// The fields of a tab that change the list's structure: which rows there
/// are, and which tabs are pins', as Chromium's pinning changes with a
/// tab's role.
fn structure() -> TabFields {
    TabFields::GROUP | TabFields::SPLIT | TabFields::PINNED
}

/// What one batch of Chromium's changes says of a Browser's tabs, heard
/// change by change, then told to the page in as few messages as say it.
#[derive(Default)]
pub struct TabChanges {
    // Tabs were added, removed or moved, or another became active.
    listed: bool,
    // The list's structure changed, or the tab in full screen.
    whole: bool,
    // The tabs whose fields the list draws changed.
    changed: Vec<BrowserTab>,
}

impl TabChanges {
    /// Hears one of the Browser's changes.
    pub fn hear(&mut self, change: &Change) {
        match change.kind {
            ChangeKind::Tabs => self.listed = true,
            ChangeKind::Group | ChangeKind::Split | ChangeKind::Fullscreen => self.whole = true,
            ChangeKind::Tab => {
                let Some(tab) = change.tab else { return };
                if change.tab_fields.intersects(structure()) {
                    self.whole = true;
                } else if change.tab_fields.intersects(drawn()) && !self.changed.contains(&tab) {
                    self.changed.push(tab);
                }
            }
            _ => {}
        }
    }

    /// Tells the page what the changes heard changed of `browser`'s tabs.
    /// The whole list goes when its structure changed, or its tabs or their
    /// order, or when the page has not been sent it yet, so has nothing to
    /// change; it says all the rest. Otherwise, which tab is active, if
    /// that changed, and the tabs that changed.
    pub fn send(self, window: &BrowserWindow, browser: &Browser) {
        if !self.listed && !self.whole && self.changed.is_empty() {
            return;
        }
        let page = &window.page_tabs;
        let reordered = || {
            let ids: Vec<i32> = browser.tabs().into_iter().map(BrowserTab::id).collect();
            !page.is_order(browser, &ids)
        };
        if self.whole || !page.has_order(browser) || (self.listed && reordered()) {
            return send_tabs(window, browser);
        }
        let space = page_space(window.place_of(browser));
        if self.listed {
            let active = browser.active_tab().map(BrowserTab::id);
            send_counted(
                window,
                "browser.activeChanged",
                &ActiveChanged { space, active },
            );
        }
        if !self.changed.is_empty() {
            let changed = TabsChanged {
                space,
                tabs: self
                    .changed
                    .into_iter()
                    .map(|tab| tab_of(window, tab, tab.state().ok()))
                    .collect(),
                links: links(browser),
            };
            send_counted(window, "browser.tabsChanged", &changed);
        }
    }
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

// The Browser's tabs, whole, which the page is sent: their IDs are kept as
// the order the page has (`PageTabs::listed`).
fn tab_list(window: &BrowserWindow, browser: &Browser) -> Tabs {
    let mut groups: Vec<TabGroup> = Vec::new();
    let mut splits: Vec<TabSplit> = Vec::new();
    let tabs: Vec<Tab> = browser
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
            tab_of(window, tab, state)
        })
        .collect();
    window
        .page_tabs
        .listed(browser, tabs.iter().map(|tab| tab.id).collect());
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

// A tab as the list draws it, with its state, read once by the caller.
fn tab_of(window: &BrowserWindow, tab: BrowserTab, state: Option<TabState>) -> Tab {
    let alert = |alert| state.is_some_and(|state| state.alert_set().contains(alert));
    Tab {
        id: tab.id(),
        title: window.page_tabs.title(tab),
        url: window.page_tabs.url(tab),
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
        group: state
            .and_then(|state| state.group)
            .map(|group| group.to_string()),
        split: state
            .and_then(|state| state.split)
            .map(|split| split.to_string()),
        role: role_for_page(tab, state),
    }
}

// Where the page draws `tab`. A debug build also says when Chromium's
// pinning and the tab's role disagree, which the pins settle as they follow
// each change (`pins::follow_tab_changes`): one that lasts is a mistake in
// what gives the roles.
fn role_for_page(tab: BrowserTab, state: Option<TabState>) -> PageRole {
    let role = PageRole::of(tab);
    let pinned = matches!(roles::of(tab), Role::Pin(_) | Role::Leaving);
    if cfg!(debug_assertions) && state.is_some_and(|state| state.pinned != pinned) {
        eprintln!(
            "Wren has a tab whose role and pinning disagree: {:?}, pinned {}.",
            roles::of(tab),
            !pinned
        );
    }
    role
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
