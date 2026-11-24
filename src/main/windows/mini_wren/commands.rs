// What the main menu's commands do in a Mini Wren, which has one page, and
// no tabs, sidebar or spaces.

use std::rc::Rc;

use wren::MainThread;

use crate::app::State;
use crate::ipc::{self, OmniboxTarget};
use crate::menus;
use crate::tabs;
use crate::windows::{self, BrowserWindow};

/// A main menu command in a Mini Wren. It closes, goes back, and copies its
/// address, as any window does. New Tab and Open Location both open its
/// own omnibox, for its page, if it shows an address: a Mini Wren has one
/// page, so what is chosen opens there. On the New Tab page, its omnibox
/// is open already. In a Mini Wren with no address they go to the window
/// the user browses in, which comes forward for the omnibox, as New
/// Window does always, and as Chrome's in a popup go to its last tabbed
/// window. The rest are for a window's tabs, sidebar and spaces, which a
/// Mini Wren has none of.
pub fn command(state: &Rc<State>, mt: MainThread, id: &str, window: &BrowserWindow) {
    let front = state.windows.front();
    match id {
        menus::CLOSE_TAB | menus::CLOSE_WINDOW => windows::close(state, mt, window.id),
        _ if menus::is_back(id) => {
            if let Err(error) = tabs::back::go_back(state, window) {
                eprintln!("Wren could not go back: {error}");
            }
        }
        menus::COPY_URL => {
            if let Some(browser) = window.browser() {
                let _ = tabs::copy_url(&browser);
            }
        }
        menus::OPEN_AS_TAB => {
            if let Err(error) = super::open_as_tab(state, mt, window.id, None) {
                eprintln!("Wren could not open the Mini Wren's page as a tab: {error}");
            }
        }
        // In the browser window: a Mini Wren has no Library.
        menus::SHOW_DOWNLOADS => {
            if let Some(front) = front {
                front.page.bring_forward();
                ipc::send_reveal(&front, None);
            }
        }
        menus::SHOW_SETTINGS => {
            if let Some(front) = front {
                front.page.bring_forward();
                ipc::send_show_settings(&front);
            }
        }
        menus::NEW_TAB | menus::OPEN_LOCATION if window.is_on_new_tab_page() => {}
        menus::NEW_TAB | menus::OPEN_LOCATION
            if window
                .mini_wren()
                .is_some_and(|mini_wren| mini_wren.address) =>
        {
            ipc::send_show_omnibox(window, OmniboxTarget::Current, true);
        }
        menus::NEW_WINDOW => windows::new_window(state, mt, front.as_deref()),
        menus::NEW_INCOGNITO_WINDOW => windows::new_incognito_window(state, mt, front.as_deref()),
        menus::NEW_MINI_WREN => super::open_empty(state, mt),
        menus::NEW_TAB | menus::OPEN_LOCATION => {
            let Some(front) = front else { return };
            front.page.bring_forward();
            let target = match id {
                menus::NEW_TAB => OmniboxTarget::NewTab,
                _ => OmniboxTarget::Current,
            };
            ipc::send_show_omnibox(&front, target, true);
        }
        _ => {}
    }
}
