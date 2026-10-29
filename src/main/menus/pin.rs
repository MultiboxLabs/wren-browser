// A pin's menu, and a folder's, in the sidebar. Its caller acts on what is
// chosen (ipc/pins.rs), as it has the app's pins; the page renames, opens,
// and asks before it deletes a folder.

use wren::MenuItem;

use super::enabled;

pub const OPEN: &str = "open";
pub const CLOSE_TAB: &str = "close-tab";
pub const GO_BACK: &str = "go-back";
pub const UPDATE_URL: &str = "update-url";
pub const COPY_LINK: &str = "copy-link";
pub const RENAME: &str = "rename";
pub const TO_FAVORITES: &str = "to-favorites";
pub const TO_SPACE: &str = "to-space";
pub const NEW_FOLDER: &str = "new-folder";
pub const REMOVE: &str = "remove";
pub const DELETE_FOLDER: &str = "delete-folder";

/// What a pin's menu is for.
pub enum PinMenu {
    Folder,
    Pin {
        /// A favourite, not a space's pin.
        favorite: bool,
        /// Its tab is open in the window.
        open: bool,
        /// A tab of it is away from its page.
        away: bool,
        /// It has one page, whose link it copies: a tab pin, not a split.
        single: bool,
        /// The window is on a space, whose pins it can join.
        in_space: bool,
    },
}

/// The items of a pin's menu, or a folder's.
pub fn pin_menu(menu: &PinMenu) -> Vec<MenuItem> {
    let PinMenu::Pin {
        favorite,
        open,
        away,
        single,
        in_space,
    } = *menu
    else {
        return vec![
            MenuItem::item(RENAME, "Rename…"),
            MenuItem::item(NEW_FOLDER, "New Folder"),
            MenuItem::Separator,
            MenuItem::item(DELETE_FOLDER, "Delete Folder…"),
        ];
    };
    let mut items = vec![match open {
        true => MenuItem::item(CLOSE_TAB, "Close Tab"),
        false => MenuItem::item(OPEN, "Open"),
    }];
    if away {
        items.push(MenuItem::item(GO_BACK, "Go Back to Pinned URL"));
        items.push(MenuItem::item(UPDATE_URL, "Update to Current URL"));
    }
    items.push(MenuItem::Separator);
    if single {
        items.push(MenuItem::item(COPY_LINK, "Copy Link"));
    }
    items.push(MenuItem::item(RENAME, "Rename…"));
    items.push(MenuItem::Separator);
    if favorite {
        items.push(enabled(MenuItem::item(TO_SPACE, "Pin to Space"), in_space));
        items.push(MenuItem::Separator);
        items.push(MenuItem::item(REMOVE, "Remove from Favourites"));
    } else {
        items.push(MenuItem::item(TO_FAVORITES, "Move to Favourites"));
        items.push(MenuItem::item(NEW_FOLDER, "New Folder"));
        items.push(MenuItem::Separator);
        items.push(MenuItem::item(REMOVE, "Unpin"));
    }
    items
}
