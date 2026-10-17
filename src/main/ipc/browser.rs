use std::rc::Rc;

use serde::Serialize;
use wren::{Browser, BrowserTab, MainThread, TabCrash, TabGroup, TabSplit, WebView};

use super::groups::Group;
use super::splits::Split;
use super::{MenuAt, failed, menu_call, png_url, with_browser};
use crate::app::State;
use crate::menus;
use crate::tabs;
use crate::window::MainWindow;

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
}

/// The tabs of the Browser in front, in its order, and which is active.
#[derive(Serialize)]
pub struct Tabs {
    /// The Browser's ID, which names its side panel's element.
    browser: i32,
    tabs: Vec<Tab>,
    active: Option<i32>,
    /// The groups of `tabs`, in their order.
    groups: Vec<Group>,
    /// The splits of `tabs`, in their order.
    splits: Vec<Split>,
}

pub fn handle(web_view: &WebView, state: &Rc<State>, mt: MainThread) {
    // The tabs; "browser.tabs" says when they change.
    let weak = Rc::downgrade(state);
    let _ = web_view.handle("browser.tabs", move |()| {
        with_browser(&weak, |_, browser| Ok(tab_list(browser)))
    });

    // A tab's favicon as a data: URL, or null; "tab.favicon" says when it
    // changes.
    let weak = Rc::downgrade(state);
    let _ = web_view.handle("tab.favicon", move |id: i32| {
        with_browser(&weak, |_, browser| {
            Ok(tab(mt, browser, id)?.favicon_png().map(png_url))
        })
    });

    // A tab on the New Tab page, at the top of the list.
    let weak = Rc::downgrade(state);
    let _ = web_view.handle("tabs.new", move |()| {
        with_browser(&weak, |_, browser| tabs::new_tab(browser).map_err(failed))
    });

    // A tab on an address, at the top of the list.
    let weak = Rc::downgrade(state);
    let _ = web_view.handle("tabs.open", move |url: String| {
        with_browser(&weak, |_, browser| {
            tabs::open(browser, &url).map_err(failed)
        })
    });

    // The active tab's address, on the clipboard.
    let weak = Rc::downgrade(state);
    let _ = web_view.handle("tabs.copyLink", move |()| {
        with_browser(&weak, |_, browser| {
            let tab = browser.active_tab().ok_or("There is no tab.")?;
            menus::copy(&tab.url());
            Ok(())
        })
    });

    let weak = Rc::downgrade(state);
    let _ = web_view.handle("tabs.activate", move |id: i32| {
        with_browser(&weak, |_, browser| {
            tab(mt, browser, id)?.activate().map_err(failed)
        })
    });

    let weak = Rc::downgrade(state);
    let _ = web_view.handle("tabs.close", move |id: i32| {
        with_browser(&weak, |_, browser| {
            tabs::close(browser, &[tab(mt, browser, id)?]).map_err(failed)
        })
    });

    // A tab's context menu, at the point the page names. Answers with what
    // was chosen, once the app has done it, or null.
    let weak = Rc::downgrade(state);
    let _ = web_view.handle_call("tabs.menu", move |call| {
        menu_call(&weak, call, |view, browser, at: MenuAt<i32>, done| {
            let tab = tab(mt, browser, at.id)?;
            menus::show_tab_menu(mt, view, browser, tab, (at.x, at.y), done).map_err(failed)
        })
    });

    // Back, forward and reload, in the active tab.
    for (name, run) in [
        ("tabs.back", BrowserTab::go_back as fn(BrowserTab) -> _),
        ("tabs.forward", BrowserTab::go_forward),
        ("tabs.reload", BrowserTab::reload),
    ] {
        let weak = Rc::downgrade(state);
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
pub fn send_tabs(main: &MainWindow, browser: &Browser) {
    let _ = main.page.web_view.send("browser.tabs", &tab_list(browser));
}

/// Tells the page a tab's favicon changed, for it to ask again.
pub fn send_favicon(main: &MainWindow, tab: BrowserTab) {
    let _ = main.page.web_view.send("tab.favicon", &tab.id());
}

fn tab_list(browser: &Browser) -> Tabs {
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
            }
        })
        .collect();
    Tabs {
        browser: browser.id(),
        tabs,
        active: browser.active_tab().map(BrowserTab::id),
        groups: groups.into_iter().map(Group::new).collect(),
        splits: splits.into_iter().filter_map(Split::new).collect(),
    }
}

// The tab an ID from the page names, if it is the Browser's.
fn tab(mt: MainThread, browser: &Browser, id: i32) -> Result<BrowserTab, String> {
    BrowserTab::from_id(mt, id)
        .filter(|tab| tab.browser().as_ref() == Some(browser))
        .ok_or_else(|| "There is no such tab.".into())
}
