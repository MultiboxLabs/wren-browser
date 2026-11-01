// The menu of the app's own icon where the system keeps it (the Dock on a Mac),
// above the system's items. The app says what is in it each time it opens.

use super::current;

/// An item of the icon's menu.
pub struct IconMenuItem {
    /// What `chosen` is told.
    pub id: &'static str,
    pub label: &'static str,
    /// Whether it can be chosen; if not, it is shown greyed out.
    pub enabled: bool,
}

/// Sets what the icon's menu has for as long as the app runs: `items` is asked
/// each time it opens, and `chosen` hears the `id` of the one chosen, with the
/// app in front.
pub fn set_icon_menu(
    items: impl Fn() -> Vec<IconMenuItem> + 'static,
    chosen: impl Fn(&str) + 'static,
) {
    current::icon_menu::set_icon_menu(items, chosen)
}
