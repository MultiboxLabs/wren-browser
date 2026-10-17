// The main menu: the system's items, Chromium's commands, and the app's own,
// which reach `App::menu_command` by their IDs here. And the menus the page
// asks for and the app acts on: the sidebar's tabs' and groups', and the
// page info popover's.

use objc2_app_kit::{NSPasteboard, NSPasteboardTypeString};
use objc2_foundation::NSString;
use wren::{
    Browser, BrowserTab, ChromiumCommand as Command, Error, MainThread, MenuItem, MenuKey,
    MenuModifiers, MenuRole, NativeView, PermissionSetting, SiteAction, SiteSecurity, SplitLayout,
    TabGroup, TabGroupColor, TabSplit,
};

use crate::tabs;

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

/// Shows a tab's menu at `point` in the page's `view`, acts on what is
/// chosen, and calls `done` with its ID, or None.
pub fn show_tab_menu(
    mt: MainThread,
    view: NativeView,
    browser: &Browser,
    tab: BrowserTab,
    point: (f64, f64),
    done: impl FnOnce(Option<String>) + 'static,
) -> Result<(), Error> {
    let all = browser.tabs();
    let index = all.iter().position(|each| *each == tab).unwrap_or(0);
    let state = tab.state()?;
    let in_group = state.group;
    let active = browser.active_tab();
    // The groups it could join.
    let others: Vec<MenuItem> = groups(browser)
        .into_iter()
        .filter(|group| Some(*group) != in_group)
        .map(|group| MenuItem::item(format!("group:{group}"), group_name(group)))
        .collect();
    let mut items = vec![
        MenuItem::item("reload", "Reload"),
        MenuItem::item("copy-link", "Copy Link"),
        MenuItem::Separator,
        MenuItem::item("new-group", "Add Tab to New Group"),
    ];
    if !others.is_empty() {
        items.push(MenuItem::submenu("Add Tab to Group", others));
    }
    if in_group.is_some() {
        items.push(MenuItem::item("ungroup", "Remove from Group"));
    }
    items.push(MenuItem::Separator);
    match state.split {
        Some(split) => {
            let stacked = split.state()?.layout == SplitLayout::Stacked;
            items.extend([
                MenuItem::item("swap", "Swap Sides"),
                MenuItem::item(
                    "layout",
                    if stacked {
                        "Show Side by Side"
                    } else {
                        "Show Stacked"
                    },
                ),
                MenuItem::item("unsplit", "Exit Split View"),
            ]);
        }
        // Beside the active tab, unless it is that tab or in a split of
        // its own.
        None => items.push(enabled(
            MenuItem::item("split", "Open in Split View"),
            active.is_some_and(|active| {
                active != tab && active.state().is_ok_and(|state| state.split.is_none())
            }),
        )),
    }
    items.extend([
        MenuItem::Separator,
        MenuItem::item("close", "Close Tab"),
        enabled(
            MenuItem::item("close-others", "Close Other Tabs"),
            all.len() > 1,
        ),
        enabled(
            MenuItem::item("close-below", "Close Tabs Below"),
            index + 1 < all.len(),
        ),
    ]);
    let browser = browser.clone();
    mt.show_context_menu(&items, view, point, move |chosen| {
        let _ = match chosen.as_deref() {
            Some("reload") => tab.reload(),
            Some("copy-link") => {
                copy(&tab.url());
                Ok(())
            }
            Some("new-group") => BrowserTab::group(mt, &[tab]).map(drop),
            Some("ungroup") => BrowserTab::ungroup(mt, &[tab]),
            Some("split") => match active {
                Some(active) => active.split_with(tab, SplitLayout::SideBySide).map(drop),
                None => Ok(()),
            },
            Some("swap") => split_of(tab).map_or(Ok(()), TabSplit::swap_tabs),
            Some("layout") => split_of(tab).map_or(Ok(()), |split| {
                let stacked = split.state()?.layout == SplitLayout::Stacked;
                split.set_layout(if stacked {
                    SplitLayout::SideBySide
                } else {
                    SplitLayout::Stacked
                })
            }),
            Some("unsplit") => split_of(tab).map_or(Ok(()), TabSplit::unsplit),
            Some(id) if id.starts_with("group:") => match TabGroup::parse(mt, &id[6..]) {
                Some(group) => group.add(&[tab]),
                None => Ok(()),
            },
            Some("close") => tabs::close(&browser, &[tab]),
            Some("close-others") => {
                let others: Vec<_> = browser
                    .tabs()
                    .into_iter()
                    .filter(|each| *each != tab)
                    .collect();
                tabs::close(&browser, &others)
            }
            Some("close-below") => {
                let all = browser.tabs();
                let below = all
                    .iter()
                    .position(|each| *each == tab)
                    .map_or(&[][..], |index| &all[index + 1..]);
                tabs::close(&browser, below)
            }
            _ => Ok(()),
        };
        done(chosen);
    })
}

/// Shows a group's menu, as `show_tab_menu` does a tab's. "rename" is left
/// to the page, which has the field.
pub fn show_group_menu(
    mt: MainThread,
    view: NativeView,
    browser: &Browser,
    group: TabGroup,
    point: (f64, f64),
    done: impl FnOnce(Option<String>) + 'static,
) -> Result<(), Error> {
    let (current, _) = group.visuals()?;
    let colors = COLORS
        .iter()
        .map(|&color| MenuItem::Item {
            id: format!("color:{}", color_name(color)),
            label: color_label(color).into(),
            enabled: true,
            checked: color == current,
            key: None,
        })
        .collect();
    let items = [
        MenuItem::item("new-tab", "New Tab in Group"),
        MenuItem::item("rename", "Rename Group…"),
        MenuItem::submenu("Color", colors),
        MenuItem::Separator,
        MenuItem::item("ungroup", "Ungroup"),
        MenuItem::item("close", "Close Group"),
    ];
    let browser = browser.clone();
    mt.show_context_menu(&items, view, point, move |chosen| {
        let members = tabs::in_group(&browser, group);
        let _ = match chosen.as_deref() {
            Some("new-tab") => {
                let after = members
                    .last()
                    .and_then(|tab| tab.index())
                    .map(|index| index + 1);
                browser
                    .add_tab("", after, true)
                    .and_then(|tab| group.add(&[tab]))
            }
            Some(id) if id.starts_with("color:") => {
                match COLORS.iter().find(|&&color| color_name(color) == &id[6..]) {
                    Some(&color) => group.visuals().and_then(|(_, collapsed)| {
                        group.set_visuals(&group.title(), color, collapsed)
                    }),
                    None => Ok(()),
                }
            }
            Some("ungroup") => BrowserTab::ungroup(mt, &members),
            Some("close") => tabs::close(&browser, &members),
            _ => Ok(()),
        };
        done(chosen);
    })
}

/// Shows the menu of the site's permission `id` below its row, as Chrome's
/// page info offers it: the default, saying what it means now, and the
/// settings other than that; and sets the one chosen.
pub fn show_permission_menu(
    mt: MainThread,
    view: NativeView,
    browser: &Browser,
    id: &str,
    point: (f64, f64),
    done: impl FnOnce(Option<String>) + 'static,
) -> Result<(), Error> {
    let index = (0..browser.site_permission_count())
        .find(|&index| browser.site_permission_id(index) == id)
        .ok_or(Error::InvalidArgument)?;
    let permission = browser.site_permission(index)?;
    // The page the menu is about: a choice made once the tab shows
    // another does nothing.
    let page = browser.site_state()?.page;
    let choice = |setting: PermissionSetting, label: String| MenuItem::Item {
        id: setting_name(setting).into(),
        label,
        enabled: !permission.managed,
        checked: permission.setting == setting,
        key: None,
    };
    let mut items = vec![choice(
        PermissionSetting::Default,
        format!("{} (Default)", setting_label(permission.default_setting)),
    )];
    items.extend(
        [PermissionSetting::Allow, PermissionSetting::Block]
            .into_iter()
            .filter(|&setting| setting != permission.default_setting)
            .map(|setting| choice(setting, setting_label(setting).into())),
    );
    let browser = browser.clone();
    let id = id.to_owned();
    mt.show_context_menu(&items, view, point, move |chosen| {
        let setting = [
            PermissionSetting::Default,
            PermissionSetting::Allow,
            PermissionSetting::Block,
        ]
        .into_iter()
        .find(|&setting| chosen.as_deref() == Some(setting_name(setting)));
        if let Some(setting) = setting
            && let Err(error) = browser.set_site_permission(page, &id, setting)
        {
            eprintln!("Wren set no permission {id}: {error:?}");
        }
        done(chosen);
    })
}

/// Shows the site's other settings below the page info popover's More
/// button: Chromium's page and dialog for the site, which a browser's own
/// page has neither of. The certificate is the security button's, and the
/// extensions page the Extensions section's.
pub fn show_site_menu(
    mt: MainThread,
    view: NativeView,
    browser: &Browser,
    point: (f64, f64),
    done: impl FnOnce(Option<String>) + 'static,
) -> Result<(), Error> {
    let state = browser.site_state().ok();
    let web = state.is_some_and(|state| state.security != SiteSecurity::Internal);
    let items = [
        enabled(MenuItem::item("settings", "Site Settings"), web),
        enabled(MenuItem::item("data", "Cookies and Site Data…"), web),
    ];
    let browser = browser.clone();
    mt.show_context_menu(&items, view, point, move |chosen| {
        let action = match chosen.as_deref() {
            Some("settings") => Some(SiteAction::Settings),
            Some("data") => Some(SiteAction::Data),
            _ => None,
        };
        if let (Some(action), Some(state)) = (action, state) {
            let _ = browser.site_action(state.page, action);
        }
        done(chosen);
    })
}

fn setting_name(setting: PermissionSetting) -> &'static str {
    match setting {
        PermissionSetting::Default => "default",
        PermissionSetting::Ask => "ask",
        PermissionSetting::Allow => "allow",
        PermissionSetting::Block => "block",
    }
}

fn setting_label(setting: PermissionSetting) -> &'static str {
    match setting {
        PermissionSetting::Allow => "Allow",
        PermissionSetting::Block => "Block",
        PermissionSetting::Ask | PermissionSetting::Default => "Ask",
    }
}

const COLORS: [TabGroupColor; 9] = [
    TabGroupColor::Grey,
    TabGroupColor::Blue,
    TabGroupColor::Red,
    TabGroupColor::Yellow,
    TabGroupColor::Green,
    TabGroupColor::Pink,
    TabGroupColor::Purple,
    TabGroupColor::Cyan,
    TabGroupColor::Orange,
];

/// A group colour's name, for the page, which has a colour for each.
pub fn color_name(color: TabGroupColor) -> &'static str {
    match color {
        TabGroupColor::Grey => "grey",
        TabGroupColor::Blue => "blue",
        TabGroupColor::Red => "red",
        TabGroupColor::Yellow => "yellow",
        TabGroupColor::Green => "green",
        TabGroupColor::Pink => "pink",
        TabGroupColor::Purple => "purple",
        TabGroupColor::Cyan => "cyan",
        TabGroupColor::Orange => "orange",
    }
}

fn color_label(color: TabGroupColor) -> &'static str {
    match color {
        TabGroupColor::Grey => "Grey",
        TabGroupColor::Blue => "Blue",
        TabGroupColor::Red => "Red",
        TabGroupColor::Yellow => "Yellow",
        TabGroupColor::Green => "Green",
        TabGroupColor::Pink => "Pink",
        TabGroupColor::Purple => "Purple",
        TabGroupColor::Cyan => "Cyan",
        TabGroupColor::Orange => "Orange",
    }
}

// A group's title, or its colour for an untitled one.
fn group_name(group: TabGroup) -> String {
    match group.title() {
        title if !title.is_empty() => title,
        _ => {
            let color = group
                .visuals()
                .map_or(TabGroupColor::Grey, |(color, _)| color);
            format!("{} Group", color_label(color))
        }
    }
}

// The Browser's groups, in their order.
fn groups(browser: &Browser) -> Vec<TabGroup> {
    let mut groups = Vec::new();
    for tab in browser.tabs() {
        if let Some(group) = tab.state().ok().and_then(|state| state.group)
            && !groups.contains(&group)
        {
            groups.push(group);
        }
    }
    groups
}

fn split_of(tab: BrowserTab) -> Option<TabSplit> {
    tab.state().ok().and_then(|state| state.split)
}

fn enabled(mut item: MenuItem, on: bool) -> MenuItem {
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
