// The main menu: the system's items, Chromium's commands, and the app's own,
// which reach `App::menu_command` by their IDs here. And the menus the page
// asks for and the app acts on, one file for each: the sidebar's tabs' and
// groups', the page info popover's, and a download's.

mod download;
mod group;
mod site;
mod tab;

use wren::{ChromiumCommand as Command, MainThread, MenuItem, MenuKey, MenuModifiers, MenuRole};

use crate::db::SpaceId;

pub use download::show_download_menu;
pub use group::{color_name, least_used_color, show_group_menu};
pub use site::{show_permission_menu, show_site_menu};
pub use tab::show_tab_menu;

pub const NEW_WINDOW: &str = "new-window";
pub const NEW_INCOGNITO_WINDOW: &str = "new-incognito-window";
pub const NEW_TAB: &str = "new-tab";
pub const OPEN_LOCATION: &str = "open-location";
pub const CLOSE_TAB: &str = "close-tab";
pub const CLOSE_WINDOW: &str = "close-window";
pub const COPY_URL: &str = "copy-url";
pub const MOVE_TAB_UP: &str = "move-tab-up";
pub const MOVE_TAB_DOWN: &str = "move-tab-down";
pub const TOGGLE_SIDEBAR: &str = "toggle-sidebar";
pub const SHOW_DOWNLOADS: &str = "show-downloads";
pub const TOGGLE_UI_DEVTOOLS: &str = "toggle-ui-devtools";
pub const TOGGLE_QUIT_WARNING: &str = "toggle-quit-warning";
/// A space's item is this and the space's ID.
pub const SPACE: &str = "space:";

/// What the window in front allows of the items that act on it.
#[derive(Clone, Copy, PartialEq, Eq)]
pub struct Front {
    /// It switches spaces: any window but one on a profile.
    pub switching: bool,
    /// One of Chromium's dialogs blocks it (`BrowserWindow::is_blocked`).
    pub blocked: bool,
}

// The app's items a dialog over the window in front greys out, as Chrome
// blocks its window: what changes its tabs, its spaces or the window. New
// Window and Quit stay, and Wren greys out Chromium's commands itself.
const BLOCKED: [&str; 6] = [
    NEW_TAB,
    OPEN_LOCATION,
    CLOSE_TAB,
    CLOSE_WINDOW,
    MOVE_TAB_UP,
    MOVE_TAB_DOWN,
];

/// Sets the main menu, whose Spaces menu lists `spaces`, each by its ID and
/// name, in the Library's order, with what `front` allows. Set again as the
/// spaces change, and as Warn Before Quitting does.
pub fn set_main_menu(mt: MainThread, spaces: &[(SpaceId, String)], front: Front) {
    if let Err(error) = mt.set_main_menu(&main_menu(mt, spaces, front)) {
        eprintln!("Wren took no main menu: {error:?}");
    }
}

/// Greys out the items the window in front does not allow, or brings them
/// back, in place, as it changes.
pub fn enable_front(mt: MainThread, spaces: &[(SpaceId, String)], front: Front) {
    let mut items = Vec::new();
    take_front_items(main_menu(mt, spaces, front), &mut items);
    for item in items {
        if let Err(error) = mt.update_main_menu_item(&item) {
            eprintln!("Wren could not change a menu item: {error:?}");
        }
    }
}

fn main_menu(mt: MainThread, spaces: &[(SpaceId, String)], front: Front) -> Vec<MenuItem> {
    let warning = mt.quit_warning();
    let mut menu = vec![
        MenuItem::submenu(
            "Wren",
            vec![
                MenuItem::role(MenuRole::About),
                MenuItem::Separator,
                system(MenuRole::Services, None, vec![]),
                MenuItem::Separator,
                MenuItem::role(MenuRole::Hide),
                MenuItem::role(MenuRole::HideOthers),
                MenuItem::role(MenuRole::ShowAll),
                MenuItem::Separator,
                // Chrome's, above Quit: whether ⌘Q asks first
                // (ipc/quit.rs). Policy may set it.
                MenuItem::Item {
                    id: TOGGLE_QUIT_WARNING.into(),
                    label: "Warn Before Quitting (⌘Q)".into(),
                    enabled: !warning.managed,
                    checked: warning.on,
                    hidden: false,
                    key: None,
                },
                MenuItem::role(MenuRole::Quit),
            ],
        ),
        MenuItem::submenu(
            "File",
            vec![
                // A window of spaces, on the key window's space, or the one
                // used last (`State::new_window`).
                keyed(NEW_WINDOW, "New Window", "n", MenuModifiers::PRIMARY),
                // The off-the-record side of the key window's profile, in a
                // window of its own that shows only it: ⇧⌘N.
                keyed(
                    NEW_INCOGNITO_WINDOW,
                    "New Incognito Window",
                    "N",
                    MenuModifiers::PRIMARY,
                ),
                // The app's own, not Chromium's: both open the page's
                // omnibox, which opens what is chosen in a new tab at the
                // top of the sidebar's list, or in the active tab. Chromium's
                // New Tab page is never shown.
                keyed(NEW_TAB, "New Tab", "t", MenuModifiers::PRIMARY),
                keyed(OPEN_LOCATION, "Open Location…", "l", MenuModifiers::PRIMARY),
                MenuItem::chromium(Command::NewSplitTab),
                MenuItem::Separator,
                // The app's own: the last tab closes the space's Browser, and
                // with no tab, the window.
                keyed(CLOSE_TAB, "Close Tab", "w", MenuModifiers::PRIMARY),
                // The app's own, so the close button's path is taken: the
                // last window closes the app. An upper-case key is the key
                // with Shift: ⇧⌘W.
                keyed(CLOSE_WINDOW, "Close Window", "W", MenuModifiers::PRIMARY),
                MenuItem::Separator,
                MenuItem::chromium(Command::ReopenClosedTab),
            ],
        ),
        MenuItem::submenu(
            "Edit",
            vec![
                MenuItem::role(MenuRole::Undo),
                MenuItem::role(MenuRole::Redo),
                MenuItem::Separator,
                MenuItem::role(MenuRole::Cut),
                MenuItem::role(MenuRole::Copy),
                // The active tab's address, with a toast saying so.
                // An upper-case key is the key with Shift: ⇧⌘C.
                keyed(COPY_URL, "Copy URL", "C", MenuModifiers::PRIMARY),
                MenuItem::role(MenuRole::Paste),
                MenuItem::role(MenuRole::PasteAndMatchStyle),
                MenuItem::role(MenuRole::Delete),
                MenuItem::role(MenuRole::SelectAll),
                MenuItem::Separator,
                // Each opens the page's find bar.
                MenuItem::chromium(Command::Find),
                MenuItem::chromium(Command::FindNext),
                MenuItem::chromium(Command::FindPrevious),
            ],
        ),
        MenuItem::submenu(
            "View",
            vec![
                keyed(
                    TOGGLE_SIDEBAR,
                    "Toggle Sidebar",
                    "s",
                    MenuModifiers::PRIMARY,
                ),
                MenuItem::Separator,
                MenuItem::chromium(Command::Reload),
                MenuItem::chromium(Command::ForceReload),
                MenuItem::chromium(Command::Stop),
                MenuItem::Separator,
                MenuItem::chromium(Command::ActualSize),
                MenuItem::chromium(Command::ZoomIn),
                MenuItem::chromium(Command::ZoomOut),
                MenuItem::Separator,
                MenuItem::chromium(Command::DeveloperTools),
                MenuItem::chromium(Command::JavascriptConsole),
                MenuItem::chromium(Command::InspectElements),
                MenuItem::chromium(Command::ViewSource),
                MenuItem::Separator,
                MenuItem::role(MenuRole::ToggleFullScreen),
            ],
        ),
        MenuItem::submenu("Spaces", space_items(spaces)),
        MenuItem::submenu(
            "History",
            vec![
                MenuItem::chromium(Command::Back),
                MenuItem::chromium(Command::Forward),
                MenuItem::chromium(Command::Home),
                MenuItem::Separator,
                MenuItem::chromium(Command::History),
                MenuItem::chromium(Command::ClearBrowsingData),
            ],
        ),
        MenuItem::submenu(
            "Tab",
            vec![
                MenuItem::chromium(Command::SelectNextTab),
                MenuItem::chromium(Command::SelectPreviousTab),
                MenuItem::Separator,
                MenuItem::chromium(Command::DuplicateTab),
                MenuItem::chromium(Command::MuteSite),
                MenuItem::chromium(Command::GroupTab),
                MenuItem::Separator,
                // Up and down the sidebar's list.
                keyed(
                    MOVE_TAB_UP,
                    "Move Tab Up",
                    "ArrowUp",
                    MenuModifiers::PRIMARY | MenuModifiers::ALT,
                ),
                keyed(
                    MOVE_TAB_DOWN,
                    "Move Tab Down",
                    "ArrowDown",
                    MenuModifiers::PRIMARY | MenuModifiers::ALT,
                ),
                MenuItem::Separator,
                MenuItem::chromium(Command::CloseOtherTabs),
                // The tabs after it are below it in the sidebar.
                MenuItem::Chromium {
                    command: Command::CloseTabsToRight,
                    label: Some("Close Tabs Below".into()),
                    key: None,
                    enabled: true,
                },
            ],
        ),
        system(
            MenuRole::Window,
            None,
            vec![
                MenuItem::role(MenuRole::Minimize),
                MenuItem::role(MenuRole::Zoom),
                MenuItem::Separator,
                // The Library's downloads, not chrome://downloads.
                keyed(
                    SHOW_DOWNLOADS,
                    "Downloads",
                    "l",
                    MenuModifiers::PRIMARY | MenuModifiers::ALT,
                ),
                MenuItem::chromium(Command::Extensions),
                MenuItem::chromium(Command::TaskManager),
                MenuItem::Separator,
                MenuItem::role(MenuRole::BringAllToFront),
            ],
        ),
        system(MenuRole::Help, Some("Help"), vec![]),
    ];
    if cfg!(debug_assertions) {
        menu.push(development_menu());
    }
    allow(&mut menu, front);
    menu
}

// Greys out the items `front` does not allow.
fn allow(items: &mut [MenuItem], front: Front) {
    for item in items {
        match item {
            MenuItem::Submenu { items, .. } => allow(items, front),
            MenuItem::Item { id, enabled, .. } if acts_on_front(id) => {
                *enabled = allowed(id, front);
            }
            _ => {}
        }
    }
}

// Moves the items that act on the window in front out of `items`, into
// `taken`.
fn take_front_items(items: Vec<MenuItem>, taken: &mut Vec<MenuItem>) {
    for item in items {
        match item {
            MenuItem::Submenu { items, .. } => take_front_items(items, taken),
            MenuItem::Item { ref id, .. } if acts_on_front(id) => taken.push(item),
            _ => {}
        }
    }
}

// Whether item `id` acts on the window in front, which allows it or not.
fn acts_on_front(id: &str) -> bool {
    id.starts_with(SPACE) || BLOCKED.contains(&id)
}

// Whether `front` allows item `id`, one that acts on it. A window on a
// profile never switches spaces.
fn allowed(id: &str, front: Front) -> bool {
    !front.blocked && (front.switching || !id.starts_with(SPACE))
}

// A space's item each, which brings it forward in the window in front, the
// first nine with ⌃1 to ⌃9.
fn space_items(spaces: &[(SpaceId, String)]) -> Vec<MenuItem> {
    spaces
        .iter()
        .enumerate()
        .map(|(index, (id, name))| {
            let id = format!("{SPACE}{id}");
            match index {
                0..9 => keyed(&id, name, &(index + 1).to_string(), MenuModifiers::CONTROL),
                _ => MenuItem::item(id, name.clone()),
            }
        })
        .collect()
}

// For working on the app, in a development build only.
fn development_menu() -> MenuItem {
    MenuItem::submenu(
        "DEVELOPMENT",
        vec![MenuItem::Item {
            id: TOGGLE_UI_DEVTOOLS.into(),
            label: "Toggle UI Devtools".into(),
            enabled: true,
            checked: false,
            hidden: false,
            key: None,
        }],
    )
}

// One of the system's own submenus.
fn system(role: MenuRole, label: Option<&str>, items: Vec<MenuItem>) -> MenuItem {
    MenuItem::Submenu {
        label: label.map(Into::into),
        role,
        items,
    }
}

fn keyed(id: &str, label: &str, key: &str, modifiers: MenuModifiers) -> MenuItem {
    MenuItem::Item {
        id: id.into(),
        label: label.into(),
        enabled: true,
        checked: false,
        hidden: false,
        key: Some(MenuKey::new(key, modifiers)),
    }
}

pub(super) fn enabled(mut item: MenuItem, on: bool) -> MenuItem {
    if let MenuItem::Item { enabled, .. } = &mut item {
        *enabled = on;
    }
    item
}
