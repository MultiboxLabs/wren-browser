// What macOS asks the app to open: a link clicked in another app while Wren
// is the default browser, or a page opened with it. Each opens in a Mini
// Wren of its own (mini_wren/from_apps.rs), which goes back to the app that sent it as
// it closes.

use std::rc::Rc;

use wren::MainThread;

use super::mini_wren::HeldMiniWren;
use crate::app::State;
use crate::platform::RunningApp;

impl State {
    /// Opens `urls`, which `sender` sent if it is known, in Mini Wren, now
    /// or once the app can.
    pub fn open_urls(self: &Rc<Self>, mt: MainThread, urls: &[String], sender: Option<RunningApp>) {
        let pages = urls.iter().map(|url| HeldMiniWren {
            url: url.clone(),
            return_to: sender.clone(),
        });
        self.hold_mini_wren(mt, pages);
    }
}
