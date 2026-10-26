// Downloads, as the page draws them (components/downloads/): the indicator
// on the Library button while they run, and the shelf of the latest above
// it. A window shows the downloads downloads/ lists for its Browser in
// front, and Chromium's download bubble, as all are done, is the shelf
// instead.

use std::cell::Cell;
use std::rc::Rc;

use serde::Deserialize;
use wren::{
    Browser, Change, ChangeKind, MainThread, Popover, PopoverAnswer, PopoverRequest,
    PopoverTrigger, WebView,
};

use super::{MenuAt, WindowRef, failed, menu_call, with_browser};
use crate::app::State;
use crate::downloads::{self, Indicator, thumbnails};
use crate::menus;
use crate::shell::{BrowserWindow, WindowId};

/// What `downloads.perform` takes.
#[derive(Deserialize)]
struct Perform {
    id: String,
    action: String,
}

thread_local! {
    // The window whose shelf shows for Chromium's bubble, and the bubble's
    // request, which closes as the shelf goes.
    static SHELF: Cell<Option<(WindowId, Popover)>> = const { Cell::new(None) };
}

pub fn handle(web_view: &WebView, window: &WindowRef, mt: MainThread) {
    // The downloads the window lists; "downloads.list" says when they
    // change.
    let weak = window.clone();
    let _ = web_view.handle("downloads.list", move |()| {
        with_browser(&weak, |found, browser| {
            let list = downloads::list(browser);
            found.note_downloads(&list);
            Ok(list)
        })
    });

    // The indicator, or null while none is drawn; "downloads.indicator"
    // says when it changes.
    let weak = window.clone();
    let _ = web_view.handle("downloads.indicator", move |()| {
        with_browser(&weak, |_, browser| Ok(downloads::indicator(browser)))
    });

    // The ID the download's thumbnail is served at, or null for none. The
    // page asks again as the download ends.
    let weak = window.clone();
    let _ = web_view.handle_call("downloads.thumbnail", move |call| {
        let found = call
            .value::<String>()
            .map_err(|error| error.to_string())
            .and_then(|id| with_browser(&weak, |_, browser| downloads::find(browser, &id)));
        match found {
            Ok(download) => thumbnails::thumbnail(download, move |thumbnail| {
                // A page that went before its answer is no error.
                let _ = call.answer(&thumbnail);
            }),
            Err(error) => {
                let _ = call.fail(&error);
            }
        }
    });

    // As Chrome's bubble does it: pause, resume, cancel, open, and so on.
    let weak = window.clone();
    let _ = web_view.handle("downloads.perform", move |perform: Perform| {
        with_browser(&weak, |_, browser| {
            let action = downloads::action(&perform.action).ok_or("There is no such action.")?;
            downloads::find(browser, &perform.id)?
                .perform(action)
                .map_err(failed)
        })
    });

    // The download's menu, at a point in the page; answers with the item
    // chosen, once it has been done.
    let weak = window.clone();
    let _ = web_view.handle_call("downloads.menu", move |call| {
        menu_call(&weak, call, |view, browser, at: MenuAt<String>, done| {
            let download = downloads::find(browser, &at.id)?;
            let state = weak.state()?;
            let done = move |chosen: Option<String>| {
                // Taken off the list, which every window on the profile shows.
                if chosen.as_deref() == Some("remove") {
                    send_all_downloads(&state);
                }
                done(chosen);
            };
            menus::show_download_menu(mt, view, download, (at.x, at.y), done).map_err(failed)
        })
    });

    // The shelf Chromium's bubble showed has gone, so the bubble's request
    // closes. Any other shelf going is no request's.
    let weak = window.clone();
    let _ = web_view.handle("downloads.shelfDone", move |()| {
        if let Some((id, _)) = SHELF.get()
            && id == weak.id
        {
            close_shelf_request();
        }
        Ok::<_, String>(())
    });
}

/// Tells `window`'s page of the downloads it lists, unless they are as it
/// was told last: as they change, and as another Browser comes in front.
pub fn send_downloads(window: &BrowserWindow, browser: &Browser) {
    let list = downloads::list(browser);
    if window.note_downloads(&list) {
        let _ = window.page.web_view.send("downloads.list", &list);
    }
}

/// Whether `change` is to downloads `browser`'s window lists.
pub fn downloads_changed(change: &Change, browser: &Browser) -> bool {
    change.kind == ChangeKind::Downloads
        && change
            .profile
            .as_ref()
            .is_some_and(|changed| downloads::lists(browser, &changed.id()))
}

/// Tells `window`'s page of its indicator.
pub fn send_indicator(window: &BrowserWindow, browser: &Browser) {
    let _ = window
        .page
        .web_view
        .send("downloads.indicator", &downloads::indicator(browser));
}

/// Tells `window`'s page there is no indicator: its space has no Browser.
pub fn send_no_indicator(window: &BrowserWindow) {
    let _ = window
        .page
        .web_view
        .send("downloads.indicator", &None::<Indicator>);
}

/// Chromium's download bubble, for `App::popover`. Its short list, shown as
/// all downloads are done, is the shelf of the window in front, for the few
/// seconds Chrome shows it; Chromium shows the rest itself. A popup's window
/// has no shelf: the indicator is in the browser window.
pub fn show_downloads_bubble(
    state: &Rc<State>,
    mt: MainThread,
    request: &PopoverRequest,
) -> PopoverAnswer {
    let automatic = request.trigger == PopoverTrigger::Automatic && request.download.is_none();
    if !automatic {
        return PopoverAnswer::Chromium;
    }
    let Some(window) = state.windows.of(&request.browser) else {
        return PopoverAnswer::None;
    };
    if window.is_popup() || !window.is_front(&request.browser) {
        return PopoverAnswer::None;
    }
    let id = window.id;
    let popover = request.popover;
    let state = Rc::downgrade(state);
    mt.later(
        move |_| match state.upgrade().and_then(|state| state.windows.get(id)) {
            Some(window) => {
                // One shelf at a time: a request it showed for before closes.
                close_shelf_request();
                SHELF.set(Some((id, popover)));
                let _ = window.page.web_view.send("downloads.showShelf", &());
            }
            // The window went in the meantime.
            None => {
                let _ = popover.close();
            }
        },
    );
    PopoverAnswer::App
}

// Tells every window's page of its downloads, as some are taken off the list.
// TODO: drop once Wren removes them, as its change tells the windows then.
fn send_all_downloads(state: &State) {
    for window in state.windows.all() {
        if let Some(browser) = window.browser() {
            send_downloads(&window, &browser);
        }
    }
}

// Closes the request of Chromium's bubble a shelf shows for, if one does.
fn close_shelf_request() {
    if let Some((_, popover)) = SHELF.take() {
        let _ = popover.close();
    }
}
