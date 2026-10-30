use wren::WebView;

use super::WindowRef;
use crate::analytics::Event;
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
        // It is saved as its width is dragged too.
        let docked = saved.is_docked();
        let toggled = state
            .sidebar
            .load()
            .is_some_and(|last| last.is_docked() != docked);
        state
            .sidebar
            .save(&saved)
            .map_err(|error| error.to_string())?;
        if toggled {
            state.analytics.record(Event::SidebarToggled { docked });
        }
        Ok::<_, String>(())
    });
}
