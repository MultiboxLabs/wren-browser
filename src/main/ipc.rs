// The calls the main window's page makes (`wren.invoke`), each by name, and
// the messages the app sends it (`wren.on`).
// src/renderer/ipc.ts is the page's side; keep the two together.

use std::rc::{Rc, Weak};

use base64::Engine;
use base64::engine::general_purpose::STANDARD as BASE64;
use serde::Serialize;
use wren::{Browser, BrowserTab, MainThread, TabCrash, WebView};

use crate::app::State;
use crate::main_window::MainWindow;
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
}

/// The tabs of the Browser in front, in its order, and which is active.
#[derive(Serialize)]
pub struct Tabs {
    /// The Browser's ID, which names its side panel's element.
    browser: i32,
    tabs: Vec<Tab>,
    active: Option<i32>,
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

    // The tabs; "browser.tabs" says when they change.
    let weak = Rc::downgrade(state);
    let _ = web_view.handle("browser.tabs", move |()| {
        with_browser(&weak, |_, browser| Ok(tabs(browser)))
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
        with_browser(&weak, |_, browser| {
            browser.add_tab("", Some(0), true).map(drop).map_err(failed)
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
            let tab = tab(mt, browser, id)?;
            // Chromium closes a Browser with its last tab; the window keeps
            // one, on the New Tab page.
            if browser.tabs().len() == 1 {
                browser.add_tab("", None, true).map_err(failed)?;
            }
            tab.close().map_err(failed)
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

/// Tells the page the tabs changed: which there are, their order, a tab's
/// title, address, or state, or which is active.
pub fn send_tabs(main: &MainWindow, browser: &Browser) {
    let _ = main.page.web_view.send("browser.tabs", &tabs(browser));
}

/// Tells the page a tab's favicon changed, for it to ask again.
pub fn send_favicon(main: &MainWindow, tab: BrowserTab) {
    let _ = main.page.web_view.send("tab.favicon", &tab.id());
}

fn tabs(browser: &Browser) -> Tabs {
    let tabs = browser
        .tabs()
        .into_iter()
        .map(|tab| {
            let state = tab.state().ok();
            Tab {
                id: tab.id(),
                title: tab.title(),
                url: tab.url(),
                loading: state.is_some_and(|state| state.loading),
                can_go_back: state.is_some_and(|state| state.can_go_back),
                can_go_forward: state.is_some_and(|state| state.can_go_forward),
                crashed: state.is_some_and(|state| state.crash != TabCrash::None),
            }
        })
        .collect();
    Tabs {
        browser: browser.id(),
        tabs,
        active: browser.active_tab().map(BrowserTab::id),
    }
}

// The tab an ID from the page names, if it is the Browser's.
fn tab(mt: MainThread, browser: &Browser, id: i32) -> Result<BrowserTab, String> {
    BrowserTab::from_id(mt, id)
        .filter(|tab| tab.browser().as_ref() == Some(browser))
        .ok_or_else(|| "There is no such tab.".into())
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
