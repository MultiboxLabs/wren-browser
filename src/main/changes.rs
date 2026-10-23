// What Chromium's changes mean for a window's page: each window takes the
// changes of the Browser it shows in front, and tells its page what it draws.

use wren::{Change, ChangeKind, TabFields};

use crate::ipc;
use crate::window::BrowserWindow;

/// Tells `window`'s page of the changes to its Browser in front.
pub fn apply(window: &BrowserWindow, changes: &[Change]) {
    let Some(browser) = window.browser() else {
        return;
    };
    // What the sidebar draws of a tab, besides its favicon.
    let drawn = TabFields::TITLE
        | TabFields::URL
        | TabFields::LOADING
        | TabFields::HISTORY
        | TabFields::CRASHED
        | TabFields::GROUP
        | TabFields::SPLIT;
    let mut tabs_changed = false;
    // The site is the active tab's, which a switch or a navigation
    // changes as well as Chromium's word on it.
    let mut site_changed = false;
    let mut extensions_changed = false;
    for change in changes {
        // A new extension's anchor is named, in the background too.
        if change.kind == ChangeKind::ExtensionActions
            && let Some(changed) = &change.browser
            && window.has_browser(changed)
        {
            window.name_anchors(changed);
        }
        if change.browser.as_ref() != Some(&browser) {
            continue;
        }
        match change.kind {
            ChangeKind::Tabs => {
                tabs_changed = true;
                site_changed = true;
            }
            // The tab in full screen is among them.
            ChangeKind::Group | ChangeKind::Split | ChangeKind::Fullscreen => tabs_changed = true,
            ChangeKind::SidePanel => ipc::send_side_panel(window, &browser),
            ChangeKind::Site => site_changed = true,
            ChangeKind::ExtensionActions => extensions_changed = true,
            ChangeKind::Anchors => ipc::send_anchors(window, &browser),
            ChangeKind::Omnibox => ipc::send_omnibox(window, &browser),
            // One the app answered has gone: Chromium's time for it is
            // up, the tab switched, or another came. A find going is a
            // popover going.
            ChangeKind::Popover => {
                ipc::send_toast(window, &browser);
                ipc::send_find(window, &browser);
            }
            ChangeKind::Find => ipc::send_find(window, &browser),
            ChangeKind::Tab => {
                let Some(tab) = change.tab else { continue };
                tabs_changed |= change.tab_fields.intersects(drawn);
                site_changed |=
                    change.tab_fields.contains(TabFields::URL) && browser.active_tab() == Some(tab);
                if change.tab_fields.contains(TabFields::FAVICON) {
                    ipc::send_favicon(window, tab);
                }
                if change.tab_fields.contains(TabFields::STATUS) {
                    ipc::send_status(window, tab);
                }
                // A newly active tab's page arrives in the page's
                // element after the page asks for it, and gets the
                // keyboard then.
                if change.tab_fields.contains(TabFields::IN_ELEMENT)
                    && browser.active_tab() == Some(tab)
                    && tab.state().is_ok_and(|state| state.in_element)
                {
                    let _ = tab.focus();
                }
            }
            _ => {}
        }
    }
    if tabs_changed {
        ipc::send_tabs(window, &browser);
    }
    if site_changed {
        ipc::send_site(window, &browser);
    }
    // A pin or a pop-out shows or hides an extension's button, its mark.
    if extensions_changed {
        ipc::send_extensions(window, &browser);
        ipc::send_anchors(window, &browser);
    }
}
