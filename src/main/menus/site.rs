// The page info popover's menus: a permission's settings, and the site's
// other settings.

use wren::{
    Browser, Error, MainThread, MenuItem, NativeView, PermissionSetting, SiteAction, SiteSecurity,
};

use super::enabled;

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
