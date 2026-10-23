use wren::WebView;

use super::{WindowRef, with_window};
use crate::window::PageWindow;

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

    let weak = window.clone();
    let _ = web_view.handle("window.setBackdropDark", move |dark: bool| {
        with_window(&weak, |window| {
            window.page.set_backdrop_dark(dark);
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

/// Tells the page the window is going full screen, or coming back.
pub fn send_full_screen(window: &PageWindow, full_screen: bool) {
    let _ = window.web_view.send("window.fullScreen", &full_screen);
}
