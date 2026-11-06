// The app icon's menu (the Dock's on a Mac), above the system's items: new
// windows, as the File menu opens them. `App::menu_command` hears them as it
// hears the File menu's. Onboarding has none: the browser is not the user's
// until they are through it.

use wren::{MainThread, MenuItem};

use super::{NEW_INCOGNITO_WINDOW, NEW_WINDOW};

/// Sets the app icon's menu: its items, or none while onboarding.
pub fn set_icon_menu(mt: MainThread, onboarding: bool) {
    let items = if onboarding {
        vec![]
    } else {
        vec![
            MenuItem::item(NEW_WINDOW, "New Window"),
            MenuItem::item(NEW_INCOGNITO_WINDOW, "New Incognito Window"),
        ]
    };
    if let Err(error) = mt.set_dock_menu(&items) {
        eprintln!("Wren took no Dock menu: {error:?}");
    }
}
