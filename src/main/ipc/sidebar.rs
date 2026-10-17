use std::rc::Rc;

use wren::WebView;

use crate::app::State;
use crate::sidebar::SidebarState;

pub fn handle(web_view: &WebView, state: &Rc<State>) {
    // The sidebar's state as it was saved, or null; the page saves it when
    // the user changes it.
    let weak = Rc::downgrade(state);
    let _ = web_view.handle("sidebar.state", move |()| {
        let state = weak.upgrade().ok_or("The app is closing.")?;
        Ok::<_, String>(state.sidebar.load())
    });

    let weak = Rc::downgrade(state);
    let _ = web_view.handle("sidebar.save", move |saved: SidebarState| {
        let state = weak.upgrade().ok_or("The app is closing.")?;
        state
            .sidebar
            .save(&saved)
            .map_err(|error| error.to_string())
    });
}
