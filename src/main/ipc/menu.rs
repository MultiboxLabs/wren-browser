use crate::main_window::MainWindow;

/// Tells the page to show or hide the sidebar, as the main menu asks.
pub fn send_toggle_sidebar(main: &MainWindow) {
    let _ = main.page.web_view.send("sidebar.toggle", &());
}
