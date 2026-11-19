// Chromium's undocked DevTools: a Browser of its own, which gets a plain
// window (`platform::DevToolsWindow`) that shows its active tab, and goes as
// its Browser closes.

use std::cell::RefCell;
use std::collections::HashMap;

use wren::Browser;

use crate::platform::DevToolsWindow;

/// The windows of undocked DevTools, each by its Browser.
#[derive(Default)]
pub struct DevTools {
    windows: RefCell<HashMap<Browser, DevToolsWindow>>,
}

impl DevTools {
    /// Makes a window for `browser`, which Chromium opened for DevTools.
    pub fn opened(&self, browser: Browser) {
        let window = DevToolsWindow::new(browser.clone());
        self.windows.borrow_mut().insert(browser, window);
    }

    /// Shows `browser`'s active tab in its window, as its tabs change, if
    /// it is DevTools'.
    pub fn tabs_changed(&self, browser: &Browser) {
        if let Some(window) = self.windows.borrow().get(browser) {
            window.show_active_tab();
        }
    }

    /// Drops `browser`'s window as it closes. Whether it was DevTools'.
    pub fn closed(&self, browser: &Browser) -> bool {
        let window = self.windows.borrow_mut().remove(browser);
        window.is_some()
    }
}
