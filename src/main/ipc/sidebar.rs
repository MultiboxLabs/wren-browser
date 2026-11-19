use wren::WebView;

use super::{WindowRef, with_window};
use crate::db::SidebarState;
use crate::sidebar::{self, hover::SidebarRegions};
use crate::windows::BrowserWindow;

pub fn handle(web_view: &WebView, window: &WindowRef) {
    // The sidebar's state as it was saved, or null; the page saves it when
    // the user changes it.
    let weak = window.clone();
    let _ = web_view.handle("sidebar.state", move |()| {
        let state = weak.state()?;
        Ok::<_, String>(state.sidebar.load())
    });

    let weak = window.clone();
    let _ = web_view.handle("sidebar.save", move |saved: SidebarState| {
        let state = weak.state()?;
        sidebar::save_state(&state, &saved)
    });

    // Where the pointer brings the sidebar out and keeps it out
    // (sidebar/hover.rs), as the window's size or the sidebar change.
    // Answers whether the pointer is over now; "sidebar.hovered" says when
    // that changes.
    let weak = window.clone();
    let _ = web_view.handle("sidebar.setHoverRegions", move |regions: SidebarRegions| {
        with_window(&weak, |window| {
            let hover = &window.sidebar_hover;
            hover.set_regions(regions);
            hover.check(&window.page);
            Ok(hover.is_over())
        })
    });
}

/// Checks whether the pointer is over the window's sidebar, as it moves or
/// the window comes into use or goes out of it, and tells the page if that
/// changed.
pub fn check_sidebar_hover(window: &BrowserWindow) {
    if let Some(over) = window.sidebar_hover.check(&window.page) {
        let _ = window.page.web_view.send("sidebar.hovered", &over);
    }
}
