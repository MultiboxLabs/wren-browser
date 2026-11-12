// The menu of an item of the sidebar: a tab of the list, a pinned tab, a
// favourite, a folder or a group. One menu for them all, built in sections,
// each there when it applies to the item: its page, its group and its
// split, its name, closing it, and last, where it is kept. So a pinned tab
// that is open has what a tab of the list has, where it applies. Several
// rows marked together, of the list or of the pins, have what acts on them
// all, and nothing that is about one page.
//
// What is chosen is done by items/menu.rs, which also finds the item
// (`Subject`).

use wren::{BrowserTab, MenuItem, SplitLayout, TabGroup};

use super::enabled;
use super::group::{color_items, group_name};
use crate::db::PinId;
use crate::items::menu::{Subject, What};
use crate::pins;
use crate::shell::Place;
use crate::tabs;

pub const OPEN: &str = "open";
pub const RELOAD: &str = "reload";
pub const COPY_LINK: &str = "copy-link";
pub const MUTE: &str = "mute";
pub const GO_BACK: &str = "go-back";
pub const UPDATE_URL: &str = "update-url";
pub const PIN_TAB: &str = "pin-tab";
pub const ADD_FAVORITE: &str = "add-favorite";
pub const TO_FAVORITES: &str = "to-favorites";
pub const TO_SPACE: &str = "to-space";
pub const NEW_GROUP: &str = "new-group";
/// Add Tab to Group's items are this and the group's ID.
pub const JOIN_GROUP: &str = "group:";
/// Add Tabs to Folder's items are this and the folder's ID.
pub const JOIN_FOLDER: &str = "folder:";
pub const LEAVE_GROUP: &str = "leave-group";
pub const SPLIT: &str = "split";
pub const SWAP: &str = "swap";
pub const LAYOUT: &str = "layout";
pub const UNSPLIT: &str = "unsplit";
/// The page's to do, as it has the field: for a pin, a folder and a group.
pub const RENAME: &str = "rename";
/// The page names the folder made, as it has the field.
pub const NEW_FOLDER: &str = "new-folder";
pub const CLOSE: &str = "close";
pub const CLOSE_OTHERS: &str = "close-others";
pub const CLOSE_BELOW: &str = "close-below";
/// Unpin, or Remove from Favourites.
pub const REMOVE: &str = "remove";
/// The page's to do, as it asks first.
pub const DELETE_FOLDER: &str = "delete-folder";
pub const NEW_TAB_IN_GROUP: &str = "new-tab-in-group";
/// Colour's items are this and the colour's name.
pub const COLOR: &str = "color:";
pub const UNGROUP: &str = "ungroup";
pub const CLOSE_GROUP: &str = "close-group";

/// The items of `subject`'s menu.
pub fn item_menu(subject: &Subject) -> Result<Vec<MenuItem>, String> {
    let sections = match &subject.what {
        What::Listed { tab, .. } => {
            // What a tab is shown with, in one section: its group, then
            // its split.
            let own = tab.state().ok().and_then(|state| state.group);
            let mut with = joins(subject, own, false);
            if own.is_some() {
                with.push(MenuItem::item(LEAVE_GROUP, "Remove from Group"));
            }
            with.extend(split(subject, *tab, true));
            vec![
                page(Some(*tab)),
                with,
                closes_tab(subject, *tab)?,
                keeps_tab(&subject.place, false),
            ]
        }
        What::Marked { .. } => vec![
            joins(subject, None, true),
            vec![MenuItem::item(CLOSE, "Close Tabs")],
            keeps_tab(&subject.place, true),
        ],
        What::MarkedPins {
            pins,
            browser,
            folders,
        } => {
            let open = browser.as_ref().is_some_and(|browser| {
                let open = pins::open_pins(browser);
                open.iter().any(|open| pins.contains(&open.pin))
            });
            vec![
                joins_folder(folders),
                if open {
                    vec![MenuItem::item(CLOSE, "Close Tabs")]
                } else {
                    Vec::new()
                },
                keeps_pin(false, &subject.place),
            ]
        }
        What::Kept { favorite, .. } => {
            let tab = subject.tab();
            let away = !subject.away().is_empty();
            vec![
                opens(tab),
                page(tab),
                goes_back(away),
                tab.map_or_else(Vec::new, |tab| split(subject, tab, false)),
                names(!*favorite),
                closes_pin(tab),
                keeps_pin(*favorite, &subject.place),
            ]
        }
        What::Folder(_) => vec![
            names(true),
            vec![MenuItem::item(DELETE_FOLDER, "Delete Folder…")],
        ],
        What::Group { group, .. } => vec![
            vec![
                MenuItem::item(NEW_TAB_IN_GROUP, "New Tab in Group"),
                MenuItem::item(RENAME, "Rename Group…"),
                MenuItem::submenu("Colour", color_items(*group, COLOR)?),
            ],
            vec![
                MenuItem::item(UNGROUP, "Ungroup"),
                MenuItem::item(CLOSE_GROUP, "Close Group"),
            ],
        ],
    };
    Ok(joined(sections))
}

// The sections that have items, with a line between each two.
fn joined(sections: Vec<Vec<MenuItem>>) -> Vec<MenuItem> {
    let mut items = Vec::new();
    for section in sections.into_iter().filter(|section| !section.is_empty()) {
        if !items.is_empty() {
            items.push(MenuItem::Separator);
        }
        items.extend(section);
    }
    items
}

// A kept tab that is not open, which the menu opens.
fn opens(tab: Option<BrowserTab>) -> Vec<MenuItem> {
    match tab {
        Some(_) => Vec::new(),
        None => vec![MenuItem::item(OPEN, "Open")],
    }
}

// What acts on the item's page: on its Chromium tab if it has one, and its
// link, which a kept tab has open or not.
fn page(tab: Option<BrowserTab>) -> Vec<MenuItem> {
    let mut items = Vec::new();
    if tab.is_some() {
        items.push(MenuItem::item(RELOAD, "Reload"));
    }
    items.push(MenuItem::item(COPY_LINK, "Copy Link"));
    if let Some(tab) = tab {
        let muted = tab.state().is_ok_and(|state| state.muted);
        items.push(MenuItem::item(
            MUTE,
            if muted { "Unmute Tab" } else { "Mute Tab" },
        ));
    }
    items
}

// For a kept tab away from its page: back to it, or keep where it is now.
fn goes_back(away: bool) -> Vec<MenuItem> {
    if !away {
        return Vec::new();
    }
    vec![
        MenuItem::item(GO_BACK, "Go Back to Pinned URL"),
        MenuItem::item(UPDATE_URL, "Update to Current URL"),
    ]
}

// Where a tab of the list can be kept, or `several` marked together, as
// the window it is in allows: pins only in a window on a space, and
// favourites not in an off-the-record one.
fn keeps_tab(place: &Place, several: bool) -> Vec<MenuItem> {
    let pin = if several { "Pin Tabs" } else { "Pin Tab" };
    vec![
        enabled(MenuItem::item(PIN_TAB, pin), place.space().is_some()),
        enabled(
            MenuItem::item(ADD_FAVORITE, "Add to Favourites"),
            !place.is_off_the_record(),
        ),
    ]
}

// Where else a kept tab can be kept, a favourite among the space's pins, in
// a window on a space, and a pinned tab among the favourites; and keeping
// it no longer.
fn keeps_pin(favorite: bool, place: &Place) -> Vec<MenuItem> {
    if favorite {
        let in_space = place.space().is_some();
        vec![
            enabled(MenuItem::item(TO_SPACE, "Pin to Space"), in_space),
            MenuItem::item(REMOVE, "Remove from Favourites"),
        ]
    } else {
        vec![
            MenuItem::item(TO_FAVORITES, "Move to Favourites"),
            MenuItem::item(REMOVE, "Unpin"),
        ]
    }
}

// The groups a tab of the list can join, but its `own`, or `several` tabs
// marked together, which may each be in any.
fn joins(subject: &Subject, own: Option<TabGroup>, several: bool) -> Vec<MenuItem> {
    let (new, join) = if several {
        ("Add Tabs to New Group", "Add Tabs to Group")
    } else {
        ("Add Tab to New Group", "Add Tab to Group")
    };
    let others: Vec<MenuItem> = subject
        .browser()
        .map_or_else(|_| Vec::new(), groups)
        .into_iter()
        .filter(|group| Some(*group) != own)
        .map(|group| MenuItem::item(format!("{JOIN_GROUP}{group}"), group_name(group)))
        .collect();
    let mut items = vec![MenuItem::item(NEW_GROUP, new)];
    if !others.is_empty() {
        items.push(MenuItem::submenu(join, others));
    }
    items
}

// A tab's split: its sides and its layout, and for a tab of the list
// (`leaves`), leaving it, or joining the active tab in one. A split pin
// stays a split until one side closes.
fn split(subject: &Subject, tab: BrowserTab, leaves: bool) -> Vec<MenuItem> {
    let Some(split) = tabs::split_of(tab) else {
        if !leaves {
            return Vec::new();
        }
        // Beside the active tab, unless it is that tab or in a split of
        // its own.
        let active = subject
            .browser()
            .ok()
            .and_then(|browser| browser.active_tab());
        let free = active.is_some_and(|active| {
            active != tab && active.state().is_ok_and(|state| state.split.is_none())
        });
        return vec![enabled(MenuItem::item(SPLIT, "Open in Split View"), free)];
    };
    let stacked = split
        .state()
        .is_ok_and(|state| state.layout == SplitLayout::Stacked);
    let mut items = vec![
        MenuItem::item(SWAP, "Swap Sides"),
        MenuItem::item(
            LAYOUT,
            if stacked {
                "Show Side by Side"
            } else {
                "Show Stacked"
            },
        ),
    ];
    if leaves {
        items.push(MenuItem::item(UNSPLIT, "Exit Split View"));
    }
    items
}

// The folder marked pinned tabs can go into: a new one, made where the
// first of them is, or one of the space's `folders`.
fn joins_folder(folders: &[(PinId, String)]) -> Vec<MenuItem> {
    let into: Vec<MenuItem> = folders
        .iter()
        .map(|(id, name)| MenuItem::item(format!("{JOIN_FOLDER}{id}"), name.as_str()))
        .collect();
    let mut items = vec![MenuItem::item(NEW_FOLDER, "Add Tabs to New Folder")];
    if !into.is_empty() {
        items.push(MenuItem::submenu("Add Tabs to Folder", into));
    }
    items
}

// A kept tab's name, and a folder's; and a folder made beside a pinned tab
// or in a folder (`folders`), which the favourites take none of.
fn names(folders: bool) -> Vec<MenuItem> {
    let mut items = vec![MenuItem::item(RENAME, "Rename…")];
    if folders {
        items.push(MenuItem::item(NEW_FOLDER, "New Folder"));
    }
    items
}

// Closing a tab of the list, and the list's other tabs, or those below it:
// those of other rows, as a split's two are one row.
fn closes_tab(subject: &Subject, tab: BrowserTab) -> Result<Vec<MenuItem>, String> {
    let all = tabs::listed(subject.browser()?);
    let row = tabs::with_split(tab);
    let last = all.iter().rposition(|each| row.contains(each));
    Ok(vec![
        MenuItem::item(CLOSE, "Close Tab"),
        enabled(
            MenuItem::item(CLOSE_OTHERS, "Close Other Tabs"),
            all.len() > row.len(),
        ),
        enabled(
            MenuItem::item(CLOSE_BELOW, "Close Tabs Below"),
            last.is_some_and(|last| last + 1 < all.len()),
        ),
    ])
}

// Closing an open kept tab's tabs, which leaves it unopened.
fn closes_pin(tab: Option<BrowserTab>) -> Vec<MenuItem> {
    match tab {
        Some(_) => vec![MenuItem::item(CLOSE, "Close Tab")],
        None => Vec::new(),
    }
}

// The Browser's groups, in their order.
fn groups(browser: &wren::Browser) -> Vec<TabGroup> {
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
