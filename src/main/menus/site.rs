// The page info popover's menus: a permission's settings, and the site's
// other settings. What is chosen is done by ipc/site.rs, as page info is
// Chromium's.

use wren::{
    Error, MainThread, MenuItem, NativeView, PermissionSetting, SiteAction, SitePermission,
};

use super::enabled;

const SETTINGS: &str = "settings";
const DATA: &str = "data";

/// Shows the menu of a site's permission below its row, as Chrome's page
/// info offers it: the default, saying what it means now, and the settings
/// other than that. `done` hears what is chosen (`chosen_setting`).
pub fn show_permission_menu(
    mt: MainThread,
    view: NativeView,
    permission: &SitePermission,
    point: (f64, f64),
    done: impl FnOnce(Option<String>) + 'static,
) -> Result<(), Error> {
    let choice = |setting: PermissionSetting, label: String| MenuItem::Item {
        id: setting_name(setting).into(),
        label,
        enabled: !permission.managed,
        checked: permission.setting == setting,
        hidden: false,
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
    mt.show_context_menu(&items, view, point, done)
}

/// The setting an item of a permission's menu stands for.
pub fn chosen_setting(chosen: &str) -> Option<PermissionSetting> {
    [
        PermissionSetting::Default,
        PermissionSetting::Allow,
        PermissionSetting::Block,
    ]
    .into_iter()
    .find(|&setting| chosen == setting_name(setting))
}

/// Shows the site's other settings below the page info popover's More
/// button: Chromium's page and dialog for the site, which a browser's own
/// page has neither of (`web`). The certificate is the security button's,
/// and the extensions page the Extensions section's. `done` hears what is
/// chosen (`chosen_action`).
pub fn show_site_menu(
    mt: MainThread,
    view: NativeView,
    web: bool,
    point: (f64, f64),
    done: impl FnOnce(Option<String>) + 'static,
) -> Result<(), Error> {
    let items = [
        enabled(MenuItem::item(SETTINGS, "Site Settings"), web),
        enabled(MenuItem::item(DATA, "Cookies and Site Data…"), web),
    ];
    mt.show_context_menu(&items, view, point, done)
}

/// What an item of the site's menu opens.
pub fn chosen_action(chosen: &str) -> Option<SiteAction> {
    match chosen {
        SETTINGS => Some(SiteAction::Settings),
        DATA => Some(SiteAction::Data),
        _ => None,
    }
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
