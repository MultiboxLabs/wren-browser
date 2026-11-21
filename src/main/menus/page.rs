// A page's context menu, which Chromium asks about before showing its own
// (`App::context_menu`). For a link, Open Link in Mini Wren takes the place
// of Chromium's Open Link as, or follows the last link-opening item when
// Open Link as is absent. What is chosen is handed back to the caller
// (`app/callbacks.rs`).

use wren::{
    ContextMenuHost, ContextMenuItem, ContextMenuRequest, Error, MainThread, MenuItem, MenuItems,
    PopoverAnswer, context_menu_item,
};

use super::enabled;

pub const OPEN_LINK_IN_MINI_WREN: &str = "open-link-in-mini-wren";

// Chromium's items that open a link in a tab or a window. When Open Link as
// is absent, as with one profile or in an incognito window, Open Link in
// Mini Wren goes after the last of these.
const LINK_OPEN_ITEMS: &[&str] = &[
    context_menu_item::OPEN_LINK_NEW_TAB,
    context_menu_item::OPEN_LINK_SPLIT_VIEW,
    context_menu_item::OPEN_LINK_NEW_WINDOW,
    context_menu_item::OPEN_LINK_INCOGNITO,
    context_menu_item::OPEN_LINK_ISOLATED,
];

/// Shows Chromium's page context menu with Wren's link changes, and hands
/// the ID of any Wren item chosen to `done`. Returns `PopoverAnswer::Chromium`
/// when Chromium's menu needs no change. Runs inside `App::context_menu`, so
/// it answers at once and shows the menu from the event loop.
pub fn show_page_menu(
    mt: MainThread,
    request: &ContextMenuRequest,
    done: impl FnOnce(String) + 'static,
) -> PopoverAnswer {
    let Some(items) = page_menu(request) else {
        return PopoverAnswer::Chromium;
    };
    let menu = request.menu;
    mt.later(move |_| {
        let shown = menu.show(&items, move |choice| {
            if let Some(item) = choice.app_item {
                done(item);
            }
        });
        if let Err(error) = shown {
            if error != Error::ContextMenuClosed {
                eprintln!("Wren showed no page menu: {error:?}");
            }
            let _ = menu.close();
        }
    });
    PopoverAnswer::App
}

// Chromium's menu edited for a link, or None when it needs no change.
fn page_menu(request: &ContextMenuRequest) -> Option<Vec<MenuItem>> {
    if request.host == ContextMenuHost::WebView {
        return None;
    }
    let has_link = request
        .link_url
        .as_deref()
        .is_some_and(|url| !url.is_empty());
    let link_enabled = has_link && is_link_enabled(&request.items);
    let mut items = request.page_items();
    adjust_link_items(&mut items, has_link, link_enabled).then_some(items)
}

fn is_link_enabled(items: &[ContextMenuItem]) -> bool {
    items.iter().any(|item| {
        item.enabled && !item.hidden && item.name.as_deref().is_some_and(is_link_open_item)
    })
}

fn is_link_open_item(name: &str) -> bool {
    name == context_menu_item::OPEN_LINK_IN_PROFILE || LINK_OPEN_ITEMS.contains(&name)
}

fn page_name(item: &MenuItem) -> Option<&str> {
    match item {
        MenuItem::Page { name, .. } => Some(name),
        _ => None,
    }
}

fn link_anchor(items: &[MenuItem]) -> Option<usize> {
    items
        .iter()
        .position(|item| page_name(item) == Some(context_menu_item::OPEN_LINK_IN_PROFILE))
        .or_else(|| {
            items.iter().rposition(|item| {
                page_name(item).is_some_and(|name| LINK_OPEN_ITEMS.contains(&name))
            })
        })
}

// Adds Open Link in Mini Wren below Open Link as, or below the last
// link-opening item when Open Link as is absent, then removes Open Link as.
// Returns whether the menu changed.
fn adjust_link_items(items: &mut Vec<MenuItem>, has_link: bool, link_enabled: bool) -> bool {
    let inserted = if has_link && let Some(index) = link_anchor(items) {
        items.insert(
            index + 1,
            enabled(
                MenuItem::item(OPEN_LINK_IN_MINI_WREN, "Open Link in Mini Wren"),
                link_enabled,
            ),
        );
        true
    } else {
        false
    };
    let removed = items.remove_named(context_menu_item::OPEN_LINK_IN_PROFILE);
    inserted || removed
}

#[cfg(test)]
mod tests {
    use super::*;

    fn page(name: &str) -> MenuItem {
        MenuItem::page(name)
    }

    fn mini_wren(on: bool) -> MenuItem {
        enabled(
            MenuItem::item(OPEN_LINK_IN_MINI_WREN, "Open Link in Mini Wren"),
            on,
        )
    }

    #[test]
    fn replaces_open_link_in_profile_with_mini_wren() {
        let mut items = vec![
            page(context_menu_item::OPEN_LINK_NEW_TAB),
            page(context_menu_item::OPEN_LINK_NEW_WINDOW),
            page(context_menu_item::OPEN_LINK_INCOGNITO),
            page(context_menu_item::OPEN_LINK_IN_PROFILE),
            MenuItem::Separator,
            page(context_menu_item::COPY_LINK),
        ];
        assert!(adjust_link_items(&mut items, true, true));
        assert_eq!(
            items,
            vec![
                page(context_menu_item::OPEN_LINK_NEW_TAB),
                page(context_menu_item::OPEN_LINK_NEW_WINDOW),
                page(context_menu_item::OPEN_LINK_INCOGNITO),
                mini_wren(true),
                MenuItem::Separator,
                page(context_menu_item::COPY_LINK),
            ]
        );
    }

    #[test]
    fn places_mini_wren_after_incognito_with_one_profile() {
        let mut items = vec![
            page(context_menu_item::OPEN_LINK_NEW_TAB),
            page(context_menu_item::OPEN_LINK_NEW_WINDOW),
            page(context_menu_item::OPEN_LINK_INCOGNITO),
            page(context_menu_item::OPEN_LINK_WITH),
            MenuItem::Separator,
            page(context_menu_item::COPY_LINK),
        ];
        assert!(adjust_link_items(&mut items, true, true));
        assert_eq!(
            items,
            vec![
                page(context_menu_item::OPEN_LINK_NEW_TAB),
                page(context_menu_item::OPEN_LINK_NEW_WINDOW),
                page(context_menu_item::OPEN_LINK_INCOGNITO),
                mini_wren(true),
                page(context_menu_item::OPEN_LINK_WITH),
                MenuItem::Separator,
                page(context_menu_item::COPY_LINK),
            ]
        );
    }

    #[test]
    fn places_mini_wren_after_new_window_in_incognito() {
        let mut items = vec![
            page(context_menu_item::OPEN_LINK_NEW_TAB),
            page(context_menu_item::OPEN_LINK_SPLIT_VIEW),
            page(context_menu_item::OPEN_LINK_NEW_WINDOW),
            MenuItem::Separator,
            page(context_menu_item::COPY_LINK),
        ];
        assert!(adjust_link_items(&mut items, true, true));
        assert_eq!(
            items,
            vec![
                page(context_menu_item::OPEN_LINK_NEW_TAB),
                page(context_menu_item::OPEN_LINK_SPLIT_VIEW),
                page(context_menu_item::OPEN_LINK_NEW_WINDOW),
                mini_wren(true),
                MenuItem::Separator,
                page(context_menu_item::COPY_LINK),
            ]
        );
    }

    #[test]
    fn disables_mini_wren_when_link_items_are_disabled() {
        let mut items = vec![
            page(context_menu_item::OPEN_LINK_NEW_TAB),
            page(context_menu_item::OPEN_LINK_NEW_WINDOW),
        ];
        assert!(adjust_link_items(&mut items, true, false));
        assert_eq!(
            items,
            vec![
                page(context_menu_item::OPEN_LINK_NEW_TAB),
                page(context_menu_item::OPEN_LINK_NEW_WINDOW),
                mini_wren(false),
            ]
        );
    }

    #[test]
    fn leaves_mailto_and_non_link_menus_unchanged() {
        let mut mailto = vec![
            page(context_menu_item::COPY_LINK),
            MenuItem::Separator,
            page(context_menu_item::INSPECT),
        ];
        assert!(!adjust_link_items(&mut mailto, true, false));

        let mut page_only = vec![
            page(context_menu_item::BACK),
            page(context_menu_item::FORWARD),
            page(context_menu_item::RELOAD),
        ];
        assert!(!adjust_link_items(&mut page_only, false, false));
    }
}
