// A tab's menu, in the sidebar.

use wren::{
    Browser, BrowserTab, Error, MainThread, MenuItem, NativeView, SplitLayout, TabGroup, TabSplit,
};

use super::group::group_name;
use super::{copy, enabled};
use crate::tabs;

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
    let (up, down) = tabs::can_move(browser, tab);
    items.extend([
        MenuItem::Separator,
        enabled(MenuItem::item("move-up", "Move Up"), up),
        enabled(MenuItem::item("move-down", "Move Down"), down),
        MenuItem::Separator,
    ]);
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
            Some("move-up") => tabs::move_by(mt, &browser, tab, -1),
            Some("move-down") => tabs::move_by(mt, &browser, tab, 1),
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
