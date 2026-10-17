use std::rc::Rc;

use wren::WebView;

use super::with_main;
use crate::app::State;
use crate::window::PageWindow;

pub fn handle(web_view: &WebView, state: &Rc<State>) {
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
        with_main(&weak, |main| {
            main.page.set_dark(dark);
            Ok(())
        })
    });

    let weak = Rc::downgrade(state);
    let _ = web_view.handle("window.setBackdropDark", move |dark: bool| {
        with_main(&weak, |main| {
            main.page.set_backdrop_dark(dark);
            Ok(())
        })
    });

    let weak = Rc::downgrade(state);
    let _ = web_view.handle("window.setButtonsPosition", move |(x, y): (f64, f64)| {
        with_main(&weak, |main| {
            main.page.set_buttons_position(x, y);
            Ok(())
        })
    });

    let weak = Rc::downgrade(state);
    let _ = web_view.handle("window.setButtonsVisible", move |visible: bool| {
        with_main(&weak, |main| {
            main.page.set_buttons_visible(visible);
            Ok(())
        })
    });
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
