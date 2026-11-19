// The sidebar: whether the pointer is over a window's floating one
// (hover.rs), and what a drop or an item's menu does to a tab, a group or a
// pin (items/). Its saved state is db/sidebar.rs's, and the page's calls
// are ipc/sidebar.rs's and ipc/items.rs's.

pub mod hover;
pub mod items;
