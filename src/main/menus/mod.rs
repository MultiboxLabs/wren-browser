// The native menus, one file for each: the main menu (main_menu.rs), the app
// icon's (icon.rs), and the menus a page asks for, an item's of the sidebar
// (item.rs), the page info popover's (site.rs) and a download's
// (download.rs). Each lists its menu. What is chosen is done by the part
// the menu is about, or by app/commands.rs for the main menu.

pub mod download;
mod icon;
pub mod item;
mod main_menu;
pub mod site;

use wren::MenuItem;

pub use download::show_download_menu;
pub use icon::set_icon_menu;
pub use item::item_menu;
pub use main_menu::*;
pub use site::{show_permission_menu, show_site_menu};

// `item`, greyed out unless `on`.
fn enabled(mut item: MenuItem, on: bool) -> MenuItem {
    if let MenuItem::Item { enabled, .. } = &mut item {
        *enabled = on;
    }
    item
}
