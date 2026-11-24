// The main menu: the system's items, Chromium's commands, and the app's own,
// which reach `App::menu_command` by their IDs here (app/commands.rs). It is
// set again as what it lists changes, and its items for the window in front
// are greyed out as that window allows.

use wren::{
    ChromiumCommand as Command, DefaultBrowser, DefaultBrowserState, MainThread, MenuItem, MenuKey,
    MenuModifiers, MenuRole,
};

use super::{enabled, set_icon_menu};
use crate::app::State;
use crate::db::SpaceId;
use crate::peeks;
use crate::spaces;
use crate::tabs;

pub const NEW_WINDOW: &str = "new-window";
pub const NEW_INCOGNITO_WINDOW: &str = "new-incognito-window";
pub const NEW_MINI_WREN: &str = "new-mini-wren";
pub const NEW_TAB: &str = "new-tab";
pub const OPEN_LOCATION: &str = "open-location";
pub const OPEN_AS_TAB: &str = "open-as-tab";
pub const CLOSE_TAB: &str = "close-tab";
pub const CLOSE_WINDOW: &str = "close-window";
pub const COPY_URL: &str = "copy-url";
pub const DUPLICATE_TAB: &str = "duplicate-tab";
pub const MOVE_TAB_UP: &str = "move-tab-up";
pub const MOVE_TAB_DOWN: &str = "move-tab-down";
pub const BACK: &str = "back";
pub const TOGGLE_SIDEBAR: &str = "toggle-sidebar";
pub const TOGGLE_ADDRESS_BAR: &str = "toggle-address-bar";
pub const SHOW_DOWNLOADS: &str = "show-downloads";
pub const SHOW_SETTINGS: &str = "show-settings";
pub const SET_DEFAULT_BROWSER: &str = "set-default-browser";
pub const IMPORT: &str = "import";
pub const TOGGLE_UI_DEVTOOLS: &str = "toggle-ui-devtools";
pub const RELOAD_UI: &str = "reload-ui";
pub const TOGGLE_QUIT_WARNING: &str = "toggle-quit-warning";
pub const CHECK_FOR_UPDATES: &str = "check-for-updates";
pub const RESET_ONBOARDING: &str = "reset-onboarding";
pub const OPEN_PEEK_TAB: &str = "open-peek-tab";
/// A space's item is this and the space's ID.
pub const SPACE: &str = "space:";
/// The items for ⌘1 to ⌘9 are this and the favourite's number, from 1.
pub const FAVORITE: &str = "favorite:";

/// New Mini Wren's key, ⌥⌘N, which works in any app too
/// (`mini_wren::take_key`).
pub fn mini_wren_key() -> MenuKey {
    MenuKey::new("n", MenuModifiers::PRIMARY | MenuModifiers::ALT)
}

/// What the window in front allows of the items that act on it.
#[derive(Clone, Copy, PartialEq, Eq)]
pub struct Front {
    /// It switches spaces: any window but one on a profile.
    pub switching: bool,
    /// One of Chromium's dialogs blocks it (`BrowserWindow::is_blocked`).
    pub blocked: bool,
    /// The window in use is a Mini Wren, whose page Open as Tab moves; not
    /// one on the New Tab page, which is no page to move.
    pub mini_wren: bool,
    /// The window in use shows a peek, which Open as Tab expands.
    pub peek: bool,
    /// Go Back does something in the active tab of the window it acts on
    /// (`tabs::back::can_go_back`).
    pub back: bool,
}

// The app's items a dialog over the window in front greys out, as Chrome
// blocks its window: what changes its tabs, its spaces or the window. New
// Window and Quit stay, and Wren greys out Chromium's commands itself.
const BLOCKED: [&str; 7] = [
    NEW_TAB,
    OPEN_LOCATION,
    CLOSE_TAB,
    CLOSE_WINDOW,
    DUPLICATE_TAB,
    MOVE_TAB_UP,
    MOVE_TAB_DOWN,
];

/// Sets the main menu again, for its Spaces menu to list the spaces as
/// they are now; or onboarding's, while it is open. The app icon's menu
/// follows onboarding too.
pub fn update_main_menu(state: &State, mt: MainThread) {
    let onboarding = state.onboarding.borrow().is_some();
    set_icon_menu(mt, onboarding);
    if onboarding {
        return set_onboarding_menu(mt, state.default_browser.get());
    }
    let front = front_menu(state);
    state.menu_front.set(front);
    let updates = state.updates.available();
    let default = state.default_browser.get();
    set_main_menu(mt, &spaces::ordered(state, mt), front, updates, default);
}

/// Greys out the main menu's items the window in front does not allow,
/// and brings them back once one that does is in front, or it does
/// again: switching spaces, which a window on a profile never does, and
/// the items for its tabs and spaces, which a dialog over it blocks.
pub fn update_front_menu(state: &State, mt: MainThread) {
    if state.onboarding.borrow().is_some() {
        return;
    }
    let front = front_menu(state);
    if state.menu_front.replace(front) != front {
        enable_front(mt, &spaces::ordered(state, mt), front);
    }
}

// What the window in front allows of the main menu.
fn front_menu(state: &State) -> Front {
    let window = state.windows.front();
    Front {
        switching: !window
            .as_ref()
            .is_some_and(|window| window.is_profile_window()),
        blocked: window.is_some_and(|window| window.is_blocked()),
        mini_wren: state
            .windows
            .in_use()
            .is_some_and(|window| window.is_mini_wren() && !window.is_on_new_tab_page()),
        peek: state
            .windows
            .active()
            .and_then(|window| window.browser())
            .and_then(|browser| peeks::active(&browser))
            .is_some(),
        // The window a command acts on (app/commands.rs), a Mini Wren too.
        back: state
            .windows
            .in_use()
            .or_else(|| state.windows.front())
            .is_some_and(|window| {
                window
                    .browser()
                    .and_then(|browser| browser.active_tab())
                    .is_some_and(|tab| tabs::back::can_go_back(&window, tab))
            }),
    }
}

// Sets the main menu, whose Spaces menu lists `spaces`, each by its ID and
// name, in the Library's order, with what `front` allows, Check for
// Updates… if `updates`, and Set as Default Browser as `default` has it.
// Set again as the spaces change, as Warn Before Quitting does, and once
// the updater starts.
fn set_main_menu(
    mt: MainThread,
    spaces: &[(SpaceId, String)],
    front: Front,
    updates: bool,
    default: Option<DefaultBrowserState>,
) {
    if let Err(error) = mt.set_main_menu(&main_menu(mt, spaces, front, updates, default)) {
        eprintln!("Wren took no main menu: {error:?}");
    }
}

// Greys out the items the window in front does not allow, or brings them
// back, in place, as it changes.
fn enable_front(mt: MainThread, spaces: &[(SpaceId, String)], front: Front) {
    let mut items = Vec::new();
    take_front_items(main_menu(mt, spaces, front, true, None), &mut items);
    for item in items {
        if let Err(error) = mt.update_main_menu_item(&item) {
            eprintln!("Wren could not change a menu item: {error:?}");
        }
    }
}

// Sets the main menu onboarding has (onboarding.rs): the app's, editing
// and the window's, and nothing of the browser's, which is not the user's
// until they are through it.
fn set_onboarding_menu(mt: MainThread, default: Option<DefaultBrowserState>) {
    let mut menu = vec![
        // Check for Updates…, Settings… and Import are greyed out: no
        // window answers them yet.
        app_menu(mt, false, false, default),
        edit_menu(vec![], vec![]),
        window_menu(vec![]),
        help_menu(),
    ];
    if cfg!(debug_assertions) {
        menu.push(development_menu());
    }
    if let Err(error) = mt.set_main_menu(&menu) {
        eprintln!("Wren took no main menu: {error:?}");
    }
}

// `updates`: the app has an updater (updates.rs); without one, Check for
// Updates… is greyed out.
fn main_menu(
    mt: MainThread,
    spaces: &[(SpaceId, String)],
    front: Front,
    updates: bool,
    default: Option<DefaultBrowserState>,
) -> Vec<MenuItem> {
    let mut menu = vec![
        app_menu(mt, updates, true, default),
        MenuItem::submenu(
            "File",
            vec![
                // A window of spaces, on the key window's space, or the one
                // used last (`windows::new_window`).
                keyed(NEW_WINDOW, "New Window", "n", MenuModifiers::PRIMARY),
                // The off-the-record side of the key window's profile, in a
                // window of its own that shows only it: ⇧⌘N.
                keyed(
                    NEW_INCOGNITO_WINDOW,
                    "New Incognito Window",
                    "N",
                    MenuModifiers::PRIMARY,
                ),
                // An empty Mini Wren (windows/mini_wren/from_apps.rs).
                keyed_by(NEW_MINI_WREN, "New Mini Wren", mini_wren_key()),
                // The app's own, not Chromium's: both open the page's
                // omnibox, which opens what is chosen in a new tab at the
                // top of the sidebar's list, or in the active tab. Chromium's
                // New Tab page is never shown.
                keyed(NEW_TAB, "New Tab", "t", MenuModifiers::PRIMARY),
                keyed(OPEN_LOCATION, "Open Location…", "l", MenuModifiers::PRIMARY),
                // A Mini Wren's page to a tab, as its toolbar's Open button
                // does, or the peek shown to a tab of the list, as its
                // Open as Tab button does; greyed out otherwise (`allowed`).
                keyed(OPEN_AS_TAB, "Open as Tab", "o", MenuModifiers::PRIMARY),
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
        edit_menu(
            // The active tab's address, with a toast saying so.
            // An upper-case key is the key with Shift: ⇧⌘C.
            vec![keyed(COPY_URL, "Copy URL", "C", MenuModifiers::PRIMARY)],
            // Each opens the page's find bar.
            vec![
                MenuItem::Separator,
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
                // Atop the sidebar or atop the page, in every window, as
                // Address Bar in the Library's settings is: ⇧⌘D.
                keyed(
                    TOGGLE_ADDRESS_BAR,
                    "Toggle Address Bar",
                    "D",
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
                // The app's own: with nothing to go back to, it closes the
                // active tab and returns to the tab that opened it
                // (tabs/back.rs).
                keyed(BACK, "Back", "[", MenuModifiers::PRIMARY),
                back_by_arrow(),
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
            ]
            .into_iter()
            .chain(favorite_items())
            .chain([
                MenuItem::Separator,
                // The app's own, as the sidebar's Duplicate is: the copy
                // stays in the background, and a split is copied whole
                // (`tabs::duplicate`). ⌥⇧D.
                keyed(DUPLICATE_TAB, "Duplicate Tab", "D", MenuModifiers::ALT),
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
            ])
            .collect(),
        ),
        window_menu(vec![
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
        ]),
        help_menu(),
    ];
    if cfg!(debug_assertions) {
        menu.push(development_menu());
    }
    allow(&mut menu, front);
    menu
}

// The app's own menu, Wren, with Quit; Check for Updates… is greyed out
// unless `updates`, and Settings… and Import unless `windows`, a window
// answering them.
fn app_menu(
    mt: MainThread,
    updates: bool,
    windows: bool,
    default: Option<DefaultBrowserState>,
) -> MenuItem {
    let warning = mt.quit_warning();
    MenuItem::submenu(
        "Wren",
        vec![
            MenuItem::role(MenuRole::About),
            // Below About, as the platform's apps have it.
            enabled(
                MenuItem::item(CHECK_FOR_UPDATES, "Check for Updates…"),
                updates,
            ),
            MenuItem::Separator,
            // The Library's settings, not chrome://settings.
            enabled(
                keyed(SHOW_SETTINGS, "Settings…", ",", MenuModifiers::PRIMARY),
                windows,
            ),
            default_browser_item(default),
            // wren://migrate, in a tab of the window the user browses in.
            enabled(
                MenuItem::item(IMPORT, "Import from Another Browser…"),
                windows,
            ),
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
    )
}

/// Checks Set as Default Browser, or not, in place, as `default` has it.
pub fn set_default_browser_item(mt: MainThread, default: Option<DefaultBrowserState>) {
    if let Err(error) = mt.update_main_menu_item(&default_browser_item(default)) {
        eprintln!("Wren could not change a menu item: {error:?}");
    }
}

// Asks macOS to make Wren the default browser, which asks the user. Checked
// and greyed out once it is, with nothing left to do; greyed out where
// policy keeps the user from it. Before macOS says, it may be chosen.
fn default_browser_item(default: Option<DefaultBrowserState>) -> MenuItem {
    let is_default = default.is_some_and(|default| default.state == DefaultBrowser::Yes);
    MenuItem::Item {
        id: SET_DEFAULT_BROWSER.into(),
        label: "Set as Default Browser".into(),
        enabled: !is_default && default.is_none_or(|default| default.can_set),
        checked: is_default,
        hidden: false,
        key: None,
    }
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
    id.starts_with(SPACE) || BLOCKED.contains(&id) || id == OPEN_AS_TAB || is_back(id)
}

/// Whether item `id` is Back, by ⌘[ or by ⌘← (`back_by_arrow`).
pub fn is_back(id: &str) -> bool {
    id == BACK || id == BACK_BY_ARROW
}

// TODO: remove `BACK_BY_ARROW` and `back_by_arrow` once Wren Runtime hands
// the app Chromium's Back command when a tab can't go back, so that ⌘←, the
// mouse's back button, swiping and a page's own menu all reach
// `tabs::back::go_back`. Until then, a hidden item of Wren's takes ⌘← from
// Chromium, whose own Back can't return to the tab's opener, and the rest do
// nothing in a tab with no history. It works only if Chromium looks for a
// key in the main menu before its own keys, which nobody has checked.
const BACK_BY_ARROW: &str = "back-by-arrow";

// Back by ⌘←, hidden, as Back shows ⌘[. A page that uses the key, as a text
// field does to move the cursor, keeps it.
fn back_by_arrow() -> MenuItem {
    MenuItem::Item {
        id: BACK_BY_ARROW.into(),
        label: "Back".into(),
        enabled: true,
        checked: false,
        hidden: true,
        key: Some(MenuKey::new("ArrowLeft", MenuModifiers::PRIMARY)),
    }
}

// Whether `front` allows item `id`, one that acts on it. A window on a
// profile never switches spaces, only a Mini Wren's page or a peek opens as
// a tab, and Back is greyed out where it would do nothing.
fn allowed(id: &str, front: Front) -> bool {
    if id == OPEN_AS_TAB {
        return front.mini_wren || front.peek;
    }
    if is_back(id) {
        return front.back && !front.blocked;
    }
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

// ⌘1 to ⌘9, which open the key window's favourites in their order, or
// select their tabs, in place of Chromium's own, which select its tabs.
// Hidden: their keys run them all the same.
fn favorite_items() -> impl Iterator<Item = MenuItem> {
    (1..=9).map(|number| MenuItem::Item {
        id: format!("{FAVORITE}{number}"),
        label: format!("Open Favourite {number}"),
        enabled: true,
        checked: false,
        hidden: true,
        key: Some(MenuKey::new(number.to_string(), MenuModifiers::PRIMARY)),
    })
}

// Edit, with the items the system's editing lacks: `after_copy`, and `after`
// at its end.
fn edit_menu(after_copy: Vec<MenuItem>, after: Vec<MenuItem>) -> MenuItem {
    let items = [
        MenuItem::role(MenuRole::Undo),
        MenuItem::role(MenuRole::Redo),
        MenuItem::Separator,
        MenuItem::role(MenuRole::Cut),
        MenuItem::role(MenuRole::Copy),
    ]
    .into_iter()
    .chain(after_copy)
    .chain([
        MenuItem::role(MenuRole::Paste),
        MenuItem::role(MenuRole::PasteAndMatchStyle),
        MenuItem::role(MenuRole::Delete),
        MenuItem::role(MenuRole::SelectAll),
    ])
    .chain(after)
    .collect();
    MenuItem::submenu("Edit", items)
}

// The system's Window menu, with `after_minimize` after Minimize.
fn window_menu(after_minimize: Vec<MenuItem>) -> MenuItem {
    let items = [MenuItem::role(MenuRole::Minimize)]
        .into_iter()
        .chain(after_minimize)
        .chain([
            MenuItem::Separator,
            MenuItem::role(MenuRole::BringAllToFront),
        ])
        .collect();
    system(MenuRole::Window, None, items)
}

fn help_menu() -> MenuItem {
    system(MenuRole::Help, Some("Help"), vec![])
}

// For working on the app, in a development build only.
fn development_menu() -> MenuItem {
    MenuItem::submenu(
        "DEVELOPMENT",
        vec![
            development_item(TOGGLE_UI_DEVTOOLS, "Toggle UI Devtools"),
            development_item(RELOAD_UI, "Reload UI"),
            // A peek in front of the active tab, whatever it is
            // (`peeks::open`).
            development_item(OPEN_PEEK_TAB, "Open Peek Tab"),
            // Quits, so the next run starts with onboarding
            // (`onboarding::reset`).
            development_item(RESET_ONBOARDING, "Reset Onboarding"),
        ],
    )
}

fn development_item(id: &str, label: &str) -> MenuItem {
    MenuItem::Item {
        id: id.into(),
        label: label.into(),
        enabled: true,
        checked: false,
        hidden: false,
        key: None,
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
    keyed_by(id, label, MenuKey::new(key, modifiers))
}

// An item with a key something else shares, as a global shortcut does.
fn keyed_by(id: &str, label: &str, key: MenuKey) -> MenuItem {
    MenuItem::Item {
        id: id.into(),
        label: label.into(),
        enabled: true,
        checked: false,
        hidden: false,
        key: Some(key),
    }
}
