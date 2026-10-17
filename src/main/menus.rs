// The main menu: the system's items, Chromium's commands, and the app's own,
// which reach `App::menu_command` by their IDs here.

use wren::{ChromiumCommand as Command, MainThread, MenuItem, MenuKey, MenuModifiers, MenuRole};

pub const NEW_TAB: &str = "new-tab";
pub const CLOSE_TAB: &str = "close-tab";
pub const TOGGLE_SIDEBAR: &str = "toggle-sidebar";

pub fn set_main_menu(mt: MainThread) {
    let menu = [
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
                // The app's own, not Chromium's: a new tab goes at the top
                // of the sidebar's list, not at its end.
                keyed(NEW_TAB, "New Tab", "t", MenuModifiers::PRIMARY),
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
    if let Err(error) = mt.set_main_menu(&menu) {
        eprintln!("Wren took no main menu: {error:?}");
    }
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
