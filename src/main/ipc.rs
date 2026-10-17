// The calls the main window's page makes (`wren.invoke`), each by name, and
// the messages the app sends it (`wren.on`).
// src/renderer/ipc.ts is the page's side; keep the two together.

use std::rc::{Rc, Weak};

use base64::Engine;
use base64::engine::general_purpose::STANDARD as BASE64;
use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use wren::{
    Browser, BrowserTab, MainThread, NativeView, PageCall, SplitLayout, TabCrash, TabGroup,
    TabGroupColor, TabSplit, WebView,
};

use crate::app::State;
use crate::main_window::MainWindow;
use crate::menus;
use crate::sidebar::SidebarState;
use crate::tabs;
use crate::window::PageWindow;

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

/// Two tabs shown side by side, or one above the other, as one.
#[derive(Serialize)]
pub struct Split {
    id: String,
    /// The left or top tab's ID.
    first: i32,
    second: i32,
    /// The first tab's share, between 0 and 1.
    ratio: f64,
    /// One above the other.
    stacked: bool,
}

#[derive(Deserialize)]
struct Ratio {
    id: String,
    ratio: f64,
    /// While the divider is still being dragged.
    dragging: bool,
}

/// A tab group, as the sidebar heads its tabs.
#[derive(Serialize)]
pub struct Group {
    id: String,
    /// "" for an untitled group.
    title: String,
    /// Chromium's name for its colour: "grey", "blue", ...
    color: &'static str,
    collapsed: bool,
}

/// Where a context menu goes: what it is for (a tab's or a group's ID),
/// and the point in the page.
#[derive(Deserialize)]
struct MenuAt<Id> {
    id: Id,
    x: f64,
    y: f64,
}

#[derive(Deserialize)]
struct Rename {
    id: String,
    title: String,
}

/// The Browser's side panel: which is open, if one is, and how wide.
#[derive(Serialize)]
pub struct SidePanel {
    open: bool,
    /// Chromium's name for it ("ReadingList", "Bookmarks", ...).
    id: String,
    /// In Chromium's language.
    title: String,
    width: f64,
}

pub fn handle_ui(web_view: &WebView, state: &Rc<State>, mt: MainThread) {
    // Whether the window is in use; "window.active" says when it changes.
    let weak = Rc::downgrade(state);
    let _ = web_view.handle("window.active", move |()| {
        with_main(&weak, |main| Ok(main.page.is_active()))
    });

    // Whether the window is full screen; "window.fullScreen" says when it
    // starts to go or to come back.
    let weak = Rc::downgrade(state);
    let _ = web_view.handle("window.fullScreen", move |()| {
        with_main(&weak, |main| Ok(main.page.is_full_screen()))
    });

    let weak = Rc::downgrade(state);
    let _ = web_view.handle("window.setDark", move |dark: bool| {
        with_main(&weak, |main| Ok(main.page.set_dark(dark)))
    });

    let weak = Rc::downgrade(state);
    let _ = web_view.handle("window.setBackdropDark", move |dark: bool| {
        with_main(&weak, |main| Ok(main.page.set_backdrop_dark(dark)))
    });

    let weak = Rc::downgrade(state);
    let _ = web_view.handle("window.setButtonsPosition", move |(x, y): (f64, f64)| {
        with_main(&weak, |main| Ok(main.page.set_buttons_position(x, y)))
    });

    let weak = Rc::downgrade(state);
    let _ = web_view.handle("window.setButtonsVisible", move |visible: bool| {
        with_main(&weak, |main| Ok(main.page.set_buttons_visible(visible)))
    });

    // The sidebar's state as it was saved, or null; the page saves it when
    // the user changes it.
    let weak = Rc::downgrade(state);
    let _ = web_view.handle("sidebar.state", move |()| {
        let state = weak.upgrade().ok_or("The app is closing.")?;
        Ok::<_, String>(state.sidebar.load())
    });

    let weak = Rc::downgrade(state);
    let _ = web_view.handle("sidebar.save", move |saved: SidebarState| {
        let state = weak.upgrade().ok_or("The app is closing.")?;
        state.sidebar.save(&saved).map_err(|error| error.to_string())
    });

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
            Ok(tab(mt, browser, id)?
                .favicon_png()
                .map(|png| format!("data:image/png;base64,{}", BASE64.encode(png))))
        })
    });

    // A tab on the New Tab page, at the top of the list.
    let weak = Rc::downgrade(state);
    let _ = web_view.handle("tabs.new", move |()| {
        with_browser(&weak, |_, browser| tabs::new_tab(browser).map_err(failed))
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

    // A group's, the same way. "rename" is the page's to do.
    let weak = Rc::downgrade(state);
    let _ = web_view.handle_call("groups.menu", move |call| {
        menu_call(&weak, call, |view, browser, at: MenuAt<String>, done| {
            let group = group(mt, browser, &at.id)?;
            menus::show_group_menu(mt, view, browser, group, (at.x, at.y), done).map_err(failed)
        })
    });

    // Collapses an open group, or opens a collapsed one.
    let weak = Rc::downgrade(state);
    let _ = web_view.handle("groups.toggle", move |id: String| {
        with_browser(&weak, |_, browser| {
            let group = group(mt, browser, &id)?;
            let (color, collapsed) = group.visuals().map_err(failed)?;
            group
                .set_visuals(&group.title(), color, !collapsed)
                .map_err(failed)
        })
    });

    let weak = Rc::downgrade(state);
    let _ = web_view.handle("groups.rename", move |rename: Rename| {
        with_browser(&weak, |_, browser| {
            let group = group(mt, browser, &rename.id)?;
            let (color, collapsed) = group.visuals().map_err(failed)?;
            group
                .set_visuals(rename.title.trim(), color, collapsed)
                .map_err(failed)
        })
    });

    // The divider between a split's tabs, as it is dragged.
    let weak = Rc::downgrade(state);
    let _ = web_view.handle("splits.setRatio", move |to: Ratio| {
        with_browser(&weak, |_, browser| {
            let split = TabSplit::parse(mt, &to.id)
                .filter(|split| {
                    let first = split.state().ok().and_then(|state| state.first);
                    first.and_then(BrowserTab::browser).as_ref() == Some(browser)
                })
                .ok_or("There is no such split.")?;
            split
                .set_ratio(to.ratio.clamp(0.0, 1.0), to.dragging)
                .map_err(failed)
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

    // The side panel; "sidePanel.state" says when it changes, Chromium's
    // own opening of one included.
    let weak = Rc::downgrade(state);
    let _ = web_view.handle("sidePanel.state", move |()| {
        with_browser(&weak, |_, browser| Ok(side_panel(browser)))
    });

    // Opens a panel by Chromium's name for it.
    let weak = Rc::downgrade(state);
    let _ = web_view.handle("sidePanel.show", move |id: String| {
        with_browser(&weak, |_, browser| {
            browser.show_side_panel(&id).map_err(failed)
        })
    });

    let weak = Rc::downgrade(state);
    let _ = web_view.handle("sidePanel.close", move |()| {
        with_browser(&weak, |_, browser| {
            browser.close_side_panel().map_err(failed)
        })
    });

    // The width the user drags the panel to, which Chromium keeps for the
    // kind of panel.
    let weak = Rc::downgrade(state);
    let _ = web_view.handle("sidePanel.setWidth", move |width: f64| {
        with_browser(&weak, |_, browser| {
            browser.set_side_panel_width(width).map_err(failed)
        })
    });
}

/// Tells the page the side panel opened, closed, or changed width.
pub fn send_side_panel(main: &MainWindow, browser: &Browser) {
    let _ = main
        .page
        .web_view
        .send("sidePanel.state", &side_panel(browser));
}

fn side_panel(browser: &Browser) -> SidePanel {
    let state = browser.side_panel_state().ok();
    SidePanel {
        open: state.is_some_and(|state| state.open),
        id: browser.side_panel_id(),
        title: browser.side_panel_title(),
        width: state.map_or(0.0, |state| state.width),
    }
}

/// Tells the page to show or hide the sidebar, as the main menu asks.
pub fn send_toggle_sidebar(main: &MainWindow) {
    let _ = main.page.web_view.send("sidebar.toggle", &());
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
    let groups = groups
        .into_iter()
        .map(|group| {
            let (color, collapsed) = group.visuals().unwrap_or((TabGroupColor::Grey, false));
            Group {
                id: group.to_string(),
                title: group.title(),
                color: menus::color_name(color),
                collapsed,
            }
        })
        .collect();
    let splits = splits
        .into_iter()
        .filter_map(|split| {
            let state = split.state().ok()?;
            Some(Split {
                id: split.to_string(),
                first: state.first?.id(),
                second: state.second?.id(),
                ratio: state.ratio,
                stacked: state.layout == SplitLayout::Stacked,
            })
        })
        .collect();
    Tabs {
        browser: browser.id(),
        tabs,
        active: browser.active_tab().map(BrowserTab::id),
        groups,
        splits,
    }
}

// The tab an ID from the page names, if it is the Browser's.
fn tab(mt: MainThread, browser: &Browser, id: i32) -> Result<BrowserTab, String> {
    BrowserTab::from_id(mt, id)
        .filter(|tab| tab.browser().as_ref() == Some(browser))
        .ok_or_else(|| "There is no such tab.".into())
}

// The group an ID from the page names, if it is the Browser's.
fn group(mt: MainThread, browser: &Browser, id: &str) -> Result<TabGroup, String> {
    TabGroup::parse(mt, id)
        .filter(|group| group.browser().as_ref() == Some(browser))
        .ok_or_else(|| "There is no such group.".into())
}

// Answers a call for a context menu: `show` finds what the menu is for and
// shows it with `done`, which answers the call with the item chosen. A menu
// that is not shown drops `done`, and with it the call, which fails it.
fn menu_call<Id: DeserializeOwned>(
    state: &Weak<State>,
    call: PageCall,
    show: impl FnOnce(
        NativeView,
        &Browser,
        MenuAt<Id>,
        Box<dyn FnOnce(Option<String>)>,
    ) -> Result<(), String>,
) {
    let at = match call.value::<MenuAt<Id>>() {
        Ok(at) => at,
        Err(error) => {
            let _ = call.fail(&error.to_string());
            return;
        }
    };
    let found = with_browser(state, |main, browser| {
        Ok((main.page.web_view.view(), browser.clone()))
    });
    let (view, browser) = match found {
        Ok(found) => found,
        Err(error) => {
            let _ = call.fail(&error);
            return;
        }
    };
    let done = Box::new(move |chosen: Option<String>| {
        let _ = call.answer(&chosen);
    });
    if let Err(error) = show(view, &browser, at, done) {
        eprintln!("Wren showed no menu: {error}");
    }
}

fn failed(error: wren::Error) -> String {
    format!("{error:?}")
}

/// Tells the page the window became active or inactive.
pub fn send_active(main: &PageWindow, active: bool) {
    // Fails only while the page is loading; it asks first once it is there.
    let _ = main.web_view.send("window.active", &active);
}

/// Tells the page the window is going full screen, or coming back.
pub fn send_full_screen(main: &PageWindow, full_screen: bool) {
    let _ = main.web_view.send("window.fullScreen", &full_screen);
}

// Runs a handler with the main window, or fails the call once it is gone.
fn with_main<A>(
    state: &Weak<State>,
    handler: impl FnOnce(&MainWindow) -> Result<A, String>,
) -> Result<A, String> {
    let state = state.upgrade().ok_or("The app is closing.")?;
    let main = state.main.borrow();
    handler(main.as_ref().ok_or("The window is closing.")?)
}

// Runs a handler with the main window and its Browser in front, or fails
// the call while there is none.
fn with_browser<A>(
    state: &Weak<State>,
    handler: impl FnOnce(&MainWindow, &Browser) -> Result<A, String>,
) -> Result<A, String> {
    with_main(state, |main| {
        let browser = main.browser().ok_or("The window has no Browser yet.")?;
        handler(main, &browser)
    })
}
