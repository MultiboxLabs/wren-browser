use serde::Serialize;
use wren::unstable_ui::UIText;
use wren::{Browser, MainThread, PermissionSetting, SiteAction, SiteSecurity, WebView};

use super::{MenuAt, WindowRef, failed, menu_call, with_browser};
use crate::menus;
use crate::window::BrowserWindow;

/// The active tab's site, as the page info popover shows it.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Site {
    /// "https://example.com", or "" for a page with no origin of its own.
    origin: String,
    /// "secure", "not-secure", "dangerous", "internal" or "enterprise".
    security: &'static str,
    /// Chrome's summary of it: "Connection is secure".
    summary: String,
    /// The connection has a certificate, which `site.certificate` shows.
    has_certificate: bool,
    /// A change made here applies once the page reloads.
    reload_needed: bool,
    permissions: Vec<Permission>,
}

/// A permission or setting Chrome's page info lists for the site: those set
/// for it, in use, or changed here.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Permission {
    /// Chromium's name for it: "geolocation", "notifications".
    id: String,
    /// In Chromium's language: "Location", and "Allowed" or "Using now".
    label: String,
    state: String,
    /// Allowed, by the site's setting or by the default.
    allowed: bool,
    /// Set by policy or an extension: the user cannot change it.
    managed: bool,
}

pub fn handle(web_view: &WebView, window: &WindowRef, mt: MainThread) {
    // The site, or null before the tab has shown a page; "site.state" says
    // when it changes.
    let weak = window.clone();
    let _ = web_view.handle("site.state", move |()| {
        with_browser(&weak, |_, browser| Ok(site(browser)))
    });

    // A permission's menu, by its ID, at the point the page names; it sets
    // what is chosen.
    let weak = window.clone();
    let _ = web_view.handle_call("site.permissionMenu", move |call| {
        menu_call(&weak, call, |view, browser, at: MenuAt<String>, done| {
            menus::show_permission_menu(mt, view, browser, &at.id, (at.x, at.y), done)
                .map_err(failed)
        })
    });

    // The site's other settings: Chromium's pages and dialogs for it.
    let weak = window.clone();
    let _ = web_view.handle_call("site.menu", move |call| {
        menu_call(&weak, call, |view, browser, at: MenuAt<()>, done| {
            menus::show_site_menu(mt, view, browser, (at.x, at.y), done).map_err(failed)
        })
    });

    // Chromium's certificate viewer, for a connection with one.
    let weak = window.clone();
    let _ = web_view.handle("site.certificate", move |()| {
        with_browser(&weak, |_, browser| {
            site_action(browser, SiteAction::Certificate)
        })
    });

    // Reloads the page, for the changes made to apply.
    let weak = window.clone();
    let _ = web_view.handle("site.reload", move |()| {
        with_browser(&weak, |_, browser| site_action(browser, SiteAction::Reload))
    });
}

// Acts on the active tab's page as it is now.
fn site_action(browser: &Browser, action: SiteAction) -> Result<(), String> {
    let page = browser.site_state().map_err(failed)?.page;
    browser.site_action(page, action).map_err(failed)
}

/// Tells the page the active tab's site changed: another page, its
/// security, or its permissions.
pub fn send_site(window: &BrowserWindow, browser: &Browser) {
    let _ = window.page.web_view.send("site.state", &site(browser));
}

/// Tells the page there is no site: its space has no Browser.
pub fn send_no_site(window: &BrowserWindow) {
    let _ = window.page.web_view.send("site.state", &None::<Site>);
}

fn site(browser: &Browser) -> Option<Site> {
    let state = browser.site_state().ok()?;
    let permissions = (0..browser.site_permission_count())
        .filter_map(|index| {
            let permission = browser.site_permission(index).ok()?;
            let setting = match permission.setting {
                PermissionSetting::Default => permission.default_setting,
                setting => setting,
            };
            Some(Permission {
                id: browser.site_permission_id(index),
                label: browser.site_permission_text(index, UIText::Label),
                state: browser.site_permission_text(index, UIText::State),
                allowed: setting == PermissionSetting::Allow,
                managed: permission.managed,
            })
        })
        .collect();
    Some(Site {
        origin: browser.site_origin(),
        security: match state.security {
            SiteSecurity::Secure => "secure",
            SiteSecurity::NotSecure => "not-secure",
            SiteSecurity::Dangerous => "dangerous",
            SiteSecurity::Internal => "internal",
            SiteSecurity::Enterprise => "enterprise",
        },
        summary: browser.site_text(UIText::Title),
        has_certificate: state.has_certificate,
        reload_needed: state.reload_needed,
        permissions,
    })
}
