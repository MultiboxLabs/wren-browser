use serde::Serialize;
use wren::WebView;

use super::{WindowRef, with_window};
use crate::db::SpaceId;
use crate::window::{BrowserWindow, PageWindow, Place};

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

    // Whether the window is in use; "window.active" says when it changes.
    let weak = window.clone();
    let _ = web_view.handle("window.active", move |()| {
        with_window(&weak, |window| Ok(window.page.is_active()))
    });

    // The space the window shows, or null while it waits for its first
    // Browser; "window.space" says when it changes.
    let weak = window.clone();
    let _ = web_view.handle("window.space", move |()| {
        with_window(&weak, |window| Ok(window.space()))
    });

    // The profile the window shows, or null for one that shows spaces;
    // "window.profile" says when it is known.
    let weak = window.clone();
    let _ = web_view.handle("window.profile", move |()| {
        with_window(&weak, |window| Ok(shown_profile(window)))
    });

    // Brings a space forward in the window; "window.space" follows.
    let weak = window.clone();
    let _ = web_view.handle("window.showSpace", move |space: SpaceId| {
        weak.state()?.show_space(weak.id, space)
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

/// Tells the page which space the window shows.
pub fn send_space(window: &BrowserWindow) {
    let _ = window.page.web_view.send("window.space", &window.space());
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
