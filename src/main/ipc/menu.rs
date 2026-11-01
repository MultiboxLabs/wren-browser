use crate::shell::BrowserWindow;

/// Tells the page to show or hide the sidebar, as the main menu asks.
pub fn send_toggle_sidebar(window: &BrowserWindow) {
    let _ = window.page.web_view.send("sidebar.toggle", &());
}

/// Opens `window`'s Library at the settings, as the main menu's Settings… asks.
pub fn send_show_settings(window: &BrowserWindow) {
    let _ = window.page.web_view.send("settings.show", &());
}
