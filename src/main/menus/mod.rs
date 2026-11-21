// The native menus, one file for each: the main menu (main_menu.rs), the app
// icon's (icon.rs), Chromium's page context menu (page.rs), and the menus
// Wren's own pages ask for, an item's of the sidebar (item.rs), the page
// info popover's (site.rs) and a download's (download.rs). Each lists its
// menu. What is chosen is done by the part the menu is about, or by app/
// for the main menu and a page's context menu.

pub mod download;
mod icon;
pub mod item;
mod main_menu;
pub mod page;
pub mod site;

use wren::{Error, MainThread, MenuItem, NativeView};

pub use download::show_download_menu;
pub use icon::set_icon_menu;
pub use item::item_menu;
pub use main_menu::*;
pub use page::show_page_menu;
pub use site::{show_permission_menu, show_site_menu};

/// Shows `items` as a context menu at `point` in `view`, and hands the ID
/// of the item chosen, if any, to `done`.
pub fn show_context_menu(
    mt: MainThread,
    view: NativeView,
    point: (f64, f64),
    items: &[MenuItem],
    done: impl FnOnce(Option<String>) + 'static,
) -> Result<(), Error> {
    let menu = mt.create_context_menu(view, point)?;
    let shown = menu.show(items, move |choice| done(choice.app_item));
    if shown.is_err() {
        let _ = menu.close();
    }
    shown
}

// `item`, greyed out unless `on`.
fn enabled(mut item: MenuItem, on: bool) -> MenuItem {
    if let MenuItem::Item { enabled, .. } = &mut item {
        *enabled = on;
    }
    item
}
