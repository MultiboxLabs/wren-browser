// The calls a page makes that act on its Browser's tabs: open, switch and
// close, and what the app says of a tab beside the list: the link
// under the pointer and its picture. The tabs themselves, as the page draws
// them, are in tabs.rs, and what moves them in items.rs.

use serde::{Deserialize, Serialize};
use wren::{Browser, BrowserTab, MainThread, TabStatus, WebView};

use super::{WindowRef, failed, with_browser, with_window};
use crate::analytics::TabFrom;
use crate::tabs;
use crate::windows::BrowserWindow;

/// What "tabs.previewChanged" says: a new picture of a tab's page.
#[derive(Serialize)]
struct PreviewChanged {
    tab: i32,
    /// The ID it is served at (`previewUrl`).
    preview: String,
}

/// The address of the link under the pointer in a tab's page, or of the
/// link with the keyboard, which the page shows over it ("tab.status").
#[derive(Serialize)]
struct Status {
    tab: i32,
    link: Option<String>,
}

/// A tab to mute or unmute.
#[derive(Deserialize)]
struct SetMuted {
    id: i32,
    muted: bool,
}

pub fn handle(web_view: &WebView, window: &WindowRef, mt: MainThread) {
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
            let state = weak.state()?;
            tabs::open(&state, browser, &url, Some(TabFrom::Sidebar)).map_err(failed)
        })
    });

    // The active tab's address, on the clipboard.
    let weak = window.clone();
    let _ = web_view.handle("tabs.copyLink", move |()| {
        with_browser(&weak, |_, browser| {
            let tab = browser.active_tab().ok_or("There is no tab.")?;
            tabs::copy_link(browser, tab).map_err(failed)
        })
    });

    // The ID the tab's picture is served at now (`previewUrl`), or null for
    // none (tabs/previews.rs). If it has none, or it may be out of date, a
    // new one is taken, and "tabs.previewChanged" says so once it is.
    let weak = window.clone();
    let _ = web_view.handle("tabs.preview", move |id: i32| {
        with_browser(&weak, |_, browser| {
            let asking = weak.clone();
            let taken = move |preview: Option<String>| {
                let Some(preview) = preview else { return };
                let _ = with_window(&asking, |window| {
                    let changed = PreviewChanged { tab: id, preview };
                    let _ = window.page.web_view.send("tabs.previewChanged", &changed);
                    Ok(())
                });
            };
            Ok(tabs::previews::request(tab(mt, browser, id)?, taken))
        })
    });

    // The tab used last before another, or null for none (`tabs::used_before`).
    let weak = window.clone();
    let _ = web_view.handle("tabs.usedBefore", move |id: i32| {
        with_browser(&weak, |_, browser| {
            Ok(tabs::used_before(browser, tab(mt, browser, id)?).map(BrowserTab::id))
        })
    });

    let weak = window.clone();
    let _ = web_view.handle("tabs.activate", move |id: i32| {
        with_browser(&weak, |_, browser| {
            tab(mt, browser, id)?.activate().map_err(failed)
        })
    });

    let weak = window.clone();
    let _ = web_view.handle("tabs.setMuted", move |set: SetMuted| {
        with_browser(&weak, |_, browser| {
            tab(mt, browser, set.id)?
                .set_muted(set.muted)
                .map_err(failed)
        })
    });

    let weak = window.clone();
    let _ = web_view.handle("tabs.close", move |id: i32| {
        with_browser(&weak, |_, browser| {
            let tab = tab(mt, browser, id)?;
            tabs::closes::close(browser, tab, TabFrom::Sidebar).map_err(failed)
        })
    });

    // The tab and the other of its split, if it is in one: its row, which
    // closes whole or not at all.
    let weak = window.clone();
    let _ = web_view.handle("tabs.closeRow", move |id: i32| {
        with_browser(&weak, |_, browser| {
            let row = tabs::with_split(tab(mt, browser, id)?);
            tabs::closes::close_together(browser, &row, TabFrom::Sidebar).map_err(failed)
        })
    });

    // The list's tabs closed but the active one, or the active one alone
    // (`tabs::clear`).
    let weak = window.clone();
    let _ = web_view.handle("tabs.clear", move |()| {
        with_browser(&weak, |_, browser| tabs::clear(browser).map_err(failed))
    });

    // Go Back in the active tab, as the main menu's Back does: with nothing
    // to go back to, it closes the tab and returns to the tab that opened it.
    let weak = window.clone();
    let _ = web_view.handle("tabs.back", move |()| {
        with_window(&weak, |window| {
            let state = weak.state()?;
            tabs::back::go_back(&state, window)
        })
    });

    // Forward, reload and stop, in the active tab.
    for (name, run) in [
        (
            "tabs.forward",
            BrowserTab::go_forward as fn(BrowserTab) -> _,
        ),
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

// The tab an ID from the page names, if it is the Browser's.
pub(super) fn tab(mt: MainThread, browser: &Browser, id: i32) -> Result<BrowserTab, String> {
    BrowserTab::from_id(mt, id)
        .filter(|tab| tab.browser().as_ref() == Some(browser))
        .ok_or_else(|| "There is no such tab.".into())
}
