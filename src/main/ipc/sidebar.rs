use wren::WebView;

use super::WindowRef;
use crate::sidebar::SidebarState;

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
        state
            .sidebar
            .save(&saved)
            .map_err(|error| error.to_string())
    });
}
