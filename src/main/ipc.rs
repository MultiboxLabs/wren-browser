// The calls the main window's page makes (`wren.invoke`), each by name, and
// the messages the app sends it (`wren.on`).
// src/renderer/ipc.ts is the page's side; keep the two together.

use std::rc::{Rc, Weak};

use wren::WebView;

use crate::app::State;
use crate::main_window::MainWindow;
use crate::window::PageWindow;

pub fn handle_ui(web_view: &WebView, state: &Rc<State>) {
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
    handler: impl FnOnce(&MainWindow) -> Result<A, &'static str>,
) -> Result<A, &'static str> {
    let state = state.upgrade().ok_or("The app is closing.")?;
    let main = state.main.borrow();
    handler(main.as_ref().ok_or("The window is closing.")?)
}
