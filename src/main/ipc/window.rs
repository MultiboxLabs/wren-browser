use serde::Serialize;
use wren::WebView;

use super::{WindowRef, failed, give_back_keyboard, with_window};
use crate::db::SpaceId;
use crate::platform::PageWindow;
use crate::shell::{BrowserWindow, Place};

/// The space the page draws for a window on a profile, made up, as no space
/// of the database has ID 0. Its tabs are this space's.
const PROFILE_SPACE: SpaceId = 0;

/// The profile a window shows, if it shows one rather than spaces.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ShownProfile {
    id: String,
    off_the_record: bool,
}

/// The space the page draws `place`'s tabs in: a space's own, or a
/// profile's made-up one.
pub(super) fn page_space(place: Option<Place>) -> Option<SpaceId> {
    match place? {
        Place::Space(space) => Some(space),
        Place::Profile { .. } => Some(PROFILE_SPACE),
    }
}

/// The space a window is on, or none while the user makes one. In one
/// message, so the page never draws a window between the two.
#[derive(Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
enum ShownSpace {
    Space { id: SpaceId },
    NewSpace,
}

/// What the page is told of the window's space: null while it waits for its
/// first Browser, or shows a profile.
fn shown_space(window: &BrowserWindow) -> Option<ShownSpace> {
    match (window.space(), window.left_space()) {
        (Some(id), _) => Some(ShownSpace::Space { id }),
        (None, Some(_)) => Some(ShownSpace::NewSpace),
        (None, None) => None,
    }
}

fn shown_profile(window: &BrowserWindow) -> Option<ShownProfile> {
    match window.place()? {
        Place::Profile { id, off_the_record } => Some(ShownProfile { id, off_the_record }),
        Place::Space(_) => None,
    }
}

pub fn handle(web_view: &WebView, window: &WindowRef) {
    // The page has drawn what it shows: the window is shown, the first time.
    let weak = window.clone();
    let _ = web_view.handle("window.show", move |()| {
        with_window(&weak, |window| {
            window.page.show();
            Ok(())
        })
    });

    // The page takes the keyboard from the tab that has it, for a field of
    // its own the user did not press into (a hover's).
    let weak = window.clone();
    let _ = web_view.handle("window.takeKeyboard", move |()| {
        with_window(&weak, |window| window.page.web_view.focus().map_err(failed))
    });

    // The page gives the keyboard back to the active tab's page.
    let weak = window.clone();
    let _ = web_view.handle("window.giveBackKeyboard", move |()| {
        with_window(&weak, |window| {
            if let Some(browser) = window.browser() {
                give_back_keyboard(&browser);
            }
            Ok(())
        })
    });

    // Whether the window is in use; "window.active" says when it changes.
    let weak = window.clone();
    let _ = web_view.handle("window.active", move |()| {
        with_window(&weak, |window| Ok(window.page.is_active()))
    });

    // The space the window shows, or that it is on none while the user
    // makes one; null while it waits for its first Browser, or shows a
    // profile. "window.space" says when it changes.
    let weak = window.clone();
    let _ = web_view.handle("window.space", move |()| {
        with_window(&weak, |window| Ok(shown_space(window)))
    });

    // The profile the window shows, or null for one that shows spaces;
    // "window.profile" says when it is known.
    let weak = window.clone();
    let _ = web_view.handle("window.profile", move |()| {
        with_window(&weak, |window| Ok(shown_profile(window)))
    });

    // What makes the window a popup's, which the page draws without a
    // sidebar; null for a browser window. It never changes.
    let weak = window.clone();
    let _ = web_view.handle("window.popup", move |()| {
        with_window(&weak, |window| Ok(window.popup()))
    });

    // Whether one of Chromium's dialogs over the window blocks its page, as
    // Chrome's block its window; "window.blocked" says when it changes.
    let weak = window.clone();
    let _ = web_view.handle("window.blocked", move |()| {
        with_window(&weak, |window| Ok(window.is_blocked()))
    });

    // Brings a space forward in the window; "window.space" follows.
    let weak = window.clone();
    let _ = web_view.handle("window.showSpace", move |space: SpaceId| {
        weak.state()?.show_space(weak.id, space)
    });

    // Puts the window on no space, for the user to make one; "window.space"
    // follows.
    let weak = window.clone();
    let _ = web_view.handle("window.startNewSpace", move |()| {
        weak.state()?.new_space(weak.id)
    });

    // Brings the window back to the space it left to make one.
    let weak = window.clone();
    let _ = web_view.handle("window.cancelNewSpace", move |()| {
        weak.state()?.cancel_new_space(weak.id)
    });

    // Whether the window is full screen; "window.fullScreen" says when it
    // starts to go or to come back.
    let weak = window.clone();
    let _ = web_view.handle("window.fullScreen", move |()| {
        with_window(&weak, |window| Ok(window.page.is_full_screen()))
    });

    let weak = window.clone();
    let _ = web_view.handle("window.setDark", move |dark: bool| {
        with_window(&weak, |window| {
            window.page.set_dark(dark);
            Ok(())
        })
    });

    // Where the window's buttons are, or null while they are hidden.
    let weak = window.clone();
    let _ = web_view.handle("window.setButtons", move |at: Option<(f64, f64)>| {
        with_window(&weak, |window| {
            window.page.set_buttons(at);
            Ok(())
        })
    });
}

/// Tells the page the window became active or inactive.
pub fn send_active(window: &PageWindow, active: bool) {
    // Fails only while the page is loading; it asks first once it is there.
    let _ = window.web_view.send("window.active", &active);
}

/// Tells the page whether one of Chromium's dialogs blocks it, as one opens
/// or closes, or another Browser comes in front.
pub fn send_blocked(window: &BrowserWindow) {
    let _ = window
        .page
        .web_view
        .send("window.blocked", &window.is_blocked());
}

/// Tells the page which space the window shows.
pub fn send_space(window: &BrowserWindow) {
    let _ = window
        .page
        .web_view
        .send("window.space", &shown_space(window));
}

/// Tells the page which profile the window shows, if it shows one.
pub fn send_profile(window: &BrowserWindow) {
    let _ = window
        .page
        .web_view
        .send("window.profile", &shown_profile(window));
}

/// Tells the page the user chose `space` from the main menu, for it to bring
/// forward as a press in the sidebar does.
pub fn send_choose_space(window: &BrowserWindow, space: SpaceId) {
    let _ = window.page.web_view.send("window.chooseSpace", &space);
}

/// Tells the page the window is going full screen, or coming back.
pub fn send_full_screen(window: &PageWindow, full_screen: bool) {
    let _ = window.web_view.send("window.fullScreen", &full_screen);
}
