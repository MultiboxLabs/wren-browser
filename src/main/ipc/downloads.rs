// Downloads, as the page draws them (components/downloads/): the indicator
// on the Library button while they run, the shelf of the latest above it,
// and the Library's Downloads. A window shows the downloads downloads/ lists
// for its Browser in front, and Chromium's download bubble is the shelf or
// the Library instead.

use std::cell::Cell;
use std::rc::Rc;

use serde::{Deserialize, Serialize};
use wren::{
    Browser, Change, ChangeKind, MainThread, Popover, PopoverAnswer, PopoverRequest,
    PopoverTrigger, WebView,
};

use super::{MenuAt, WindowRef, failed, menu_call, with_browser};
use crate::app::State;
use crate::downloads::{self, Indicator, thumbnails};
use crate::menus;
use crate::windows::{BrowserWindow, WindowId};

/// What `downloads.perform` takes.
#[derive(Deserialize)]
struct Perform {
    id: String,
    action: String,
}

/// What "downloads.started" says: a download that has started in the window
/// the user is in, and where the pointer was over the page as it did, in
/// points from its top left; None if it was outside the window.
#[derive(Serialize)]
struct Started {
    id: String,
    at: Option<(f64, f64)>,
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
            // Those that started before the page asked are no news to it.
            let list = downloads::list(browser);
            found.told.note_downloads(&list);
            Ok(list)
        })
    });

    // The whole history, which the Library lists; "downloads.history" says
    // when it changes.
    let weak = window.clone();
    let _ = web_view.handle("downloads.history", move |()| {
        with_browser(&weak, |found, browser| {
            let history = downloads::history(browser);
            found.told.note_history(&history);
            Ok(history)
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
            let state = download.state().map_err(failed)?;
            let chose = move |chosen: Option<String>| {
                if let Some(chosen) = &chosen {
                    let _ = downloads::choose(download, &state, chosen);
                }
                done(chosen);
            };
            menus::show_download_menu(mt, view, &state, (at.x, at.y), chose).map_err(failed)
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

/// Tells `window`'s page of the downloads it lists, the shelf's and the
/// Library's history, each unless it is as it was told last: as they
/// change, and as another Browser comes in front. Each that has started
/// since, the window the user is in hears of too, after the shelf's list
/// that has it: it was started there, by what the pointer did, most likely.
pub fn send_downloads(window: &BrowserWindow, browser: &Browser) {
    // A Mini Wren has no Library.
    if !window.is_mini_wren() {
        let history = downloads::history(browser);
        if window.told.note_history(&history) {
            let _ = window.page.web_view.send("downloads.history", &history);
        }
    }
    let list = downloads::list(browser);
    let Some(started) = window.told.note_downloads(&list) else {
        return;
    };
    let web_view = &window.page.web_view;
    let _ = web_view.send("downloads.list", &list);
    // A Mini Wren has no Library button for it to go to.
    if window.is_mini_wren() || !window.page.is_active() {
        return;
    }
    let at = window.page.pointer();
    for id in started {
        let _ = web_view.send("downloads.started", &Started { id, at });
    }
}

/// Whether `change` is to downloads `browser`'s window lists: to its lists,
/// or to one download's progress or state.
pub fn downloads_changed(change: &Change, browser: &Browser) -> bool {
    matches!(change.kind, ChangeKind::Downloads | ChangeKind::Download)
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

/// Opens `window`'s Library at the downloads, at `download`'s if it names
/// one, as Window ▸ Downloads does.
pub fn send_reveal(window: &BrowserWindow, download: Option<String>) {
    let _ = window.page.web_view.send("downloads.reveal", &download);
}

/// Chromium's download bubble, for `App::popover`. Its short list, shown as
/// all downloads are done, is the shelf of the window in front, for the few
/// seconds Chrome shows it; the full list, or one download's warning, opens
/// the Library at the downloads, and Chromium shows nothing. A Mini Wren
/// has neither: the indicator is in the browser window.
pub fn show_downloads_bubble(
    state: &Rc<State>,
    mt: MainThread,
    request: &PopoverRequest,
) -> PopoverAnswer {
    let Some(window) = state.windows.of(&request.browser) else {
        return PopoverAnswer::None;
    };
    let automatic = request.trigger == PopoverTrigger::Automatic && request.download.is_none();
    if window.is_mini_wren() || (automatic && !window.is_front(&request.browser)) {
        return PopoverAnswer::None;
    }
    let id = window.id;
    let popover = request.popover;
    let download = request.download.map(|download| download.id().to_string());
    let state = Rc::downgrade(state);
    mt.later(move |_| {
        let window = state.upgrade().and_then(|state| state.windows.get(id));
        match window {
            Some(window) if automatic => {
                // One shelf at a time: a request it showed for before closes.
                close_shelf_request();
                SHELF.set(Some((id, popover)));
                let _ = window.page.web_view.send("downloads.showShelf", &());
            }
            Some(window) => send_reveal(&window, download),
            // The window went in the meantime.
            None if automatic => {
                let _ = popover.close();
            }
            None => {}
        }
    });
    if automatic {
        PopoverAnswer::App
    } else {
        PopoverAnswer::None
    }
}

// Closes the request of Chromium's bubble a shelf shows for, if one does.
fn close_shelf_request() {
    if let Some((_, popover)) = SHELF.take() {
        let _ = popover.close();
    }
}
