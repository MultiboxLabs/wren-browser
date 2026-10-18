use crate::window::BrowserWindow;

/// Tells the page to show or hide the sidebar, as the main menu asks.
pub fn send_toggle_sidebar(window: &BrowserWindow) {
    let _ = window.page.web_view.send("sidebar.toggle", &());
}
