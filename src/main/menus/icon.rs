// The app icon's menu: new windows, as the File menu opens them. Onboarding
// greys them out: the browser is not the user's until they are through it.

use std::rc::Rc;

use wren::MainThread;

use super::{NEW_INCOGNITO_WINDOW, NEW_WINDOW};
use crate::app::State;
use crate::platform::{IconMenuItem, set_icon_menu};

/// Sets the app icon's menu, once. It holds `state` weakly: the platform keeps
/// the menu until the process ends, and `main` drops the state before that,
/// while what it drops can still run.
pub fn set_app_icon_menu(mt: MainThread, state: &Rc<State>) {
    let items = {
        let state = Rc::downgrade(state);
        move || {
            let enabled = state
                .upgrade()
                .is_some_and(|state| state.onboarding().is_none());
            vec![
                IconMenuItem {
                    id: NEW_WINDOW,
                    label: "New Window",
                    enabled,
                },
                IconMenuItem {
                    id: NEW_INCOGNITO_WINDOW,
                    label: "New Incognito Window",
                    enabled,
                },
            ]
        }
    };
    let state = Rc::downgrade(state);
    set_icon_menu(items, move |id| {
        let Some(state) = state.upgrade() else { return };
        let front = state.windows.front();
        match id {
            NEW_WINDOW => state.new_window(mt, front.as_deref()),
            NEW_INCOGNITO_WINDOW => state.new_incognito_window(mt, front.as_deref()),
            _ => {}
        }
    });
}
