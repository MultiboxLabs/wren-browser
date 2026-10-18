// The main menu: the system's items, Chromium's commands, and the app's own,
// which reach `App::menu_command` by their IDs here. And the menus the page
// asks for and the app acts on, one file for each: the sidebar's tabs' and
// groups', and the page info popover's.

mod group;
mod site;
mod tab;

use objc2_app_kit::{NSPasteboard, NSPasteboardTypeString};
use objc2_foundation::NSString;
use wren::{ChromiumCommand as Command, MainThread, MenuItem, MenuKey, MenuModifiers, MenuRole};

pub use group::{color_name, least_used_color, show_group_menu};
pub use site::{show_permission_menu, show_site_menu};
pub use tab::show_tab_menu;

pub const NEW_TAB: &str = "new-tab";
pub const OPEN_LOCATION: &str = "open-location";
pub const CLOSE_TAB: &str = "close-tab";
pub const COPY_URL: &str = "copy-url";
pub const BACK: &str = "back";
pub const FORWARD: &str = "forward";
pub const MOVE_TAB_UP: &str = "move-tab-up";
pub const MOVE_TAB_DOWN: &str = "move-tab-down";
pub const TOGGLE_SIDEBAR: &str = "toggle-sidebar";
pub const TOGGLE_UI_DEVTOOLS: &str = "toggle-ui-devtools";

pub fn set_main_menu(mt: MainThread) {
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
                MenuItem::role(MenuRole::Quit),
            ],
        ),
        MenuItem::submenu(
            "File",
            vec![
                // The app's own, not Chromium's: both open the page's
                // omnibox, which opens what is chosen in a new tab at the
                // top of the sidebar's list, or in the active tab. Chromium's
                // New Tab page is never shown.
                keyed(NEW_TAB, "New Tab", "t", MenuModifiers::PRIMARY),
                keyed(OPEN_LOCATION, "Open Location…", "l", MenuModifiers::PRIMARY),
                MenuItem::chromium(Command::NewSplitTab),
                MenuItem::Separator,
                // Keeps the window's last tab, which Chromium's would close
                // with the Browser.
                keyed(CLOSE_TAB, "Close Tab", "w", MenuModifiers::PRIMARY),
                MenuItem::role(MenuRole::CloseWindow),
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
        MenuItem::submenu(
            "History",
            vec![
                MenuItem::chromium(Command::Back),
                MenuItem::chromium(Command::Forward),
                // Chrome has ⌘← and ⌘→ for these too, but a Chromium item
                // takes one key. So the app's own items repeat them, shown
                // twice.
                // TODO: Make these hidden items, or Chromium's keys
                // alternates, once Wren has a way to.
                keyed(BACK, "Back", "ArrowLeft", MenuModifiers::PRIMARY),
                keyed(FORWARD, "Forward", "ArrowRight", MenuModifiers::PRIMARY),
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
                MenuItem::chromium(Command::Downloads),
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
    if let Err(error) = mt.set_main_menu(&menu) {
        eprintln!("Wren took no main menu: {error:?}");
    }
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
        key: Some(MenuKey::new(key, modifiers)),
    }
}

pub(super) fn enabled(mut item: MenuItem, on: bool) -> MenuItem {
    if let MenuItem::Item { enabled, .. } = &mut item {
        *enabled = on;
    }
    item
}

/// Puts text on the clipboard.
pub fn copy(text: &str) {
    let pasteboard = NSPasteboard::generalPasteboard();
    pasteboard.clearContents();
    pasteboard.setString_forType(&NSString::from_str(text), unsafe { NSPasteboardTypeString });
}
