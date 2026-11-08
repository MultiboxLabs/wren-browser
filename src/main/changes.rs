// What Chromium's changes mean for a window's page: each window takes the
// changes of the Browser it shows in front, and tells its page what it draws.
// Of its Browsers behind, it tells only their tabs, which the sidebar draws
// as it swipes to their spaces.

use wren::{Browser, Change, ChangeKind, TabFields};

use crate::ipc;
use crate::shell::BrowserWindow;

/// Tells `window`'s page of the changes to its Browser in front, and
/// answers whether the window's title may have changed with them: the
/// active tab's title, or which tab is active, or whether one is.
pub fn apply(window: &BrowserWindow, changes: &[Change]) -> bool {
    apply_behind(window, changes);
    let Some(browser) = window.browser() else {
        return false;
    };
    let drawn = drawn();
    let mut tabs_changed = false;
    // The site is the active tab's, which a switch or a navigation
    // changes as well as Chromium's word on it.
    let mut site_changed = false;
    let mut extensions_changed = false;
    let mut title_changed = false;
    let mut downloads_changed = false;
    for change in changes {
        // Not a Browser's but a profile's.
        downloads_changed |= ipc::downloads_changed(change, &browser);
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
                title_changed = true;
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
            ChangeKind::DownloadButton => ipc::send_indicator(window, &browser),
            ChangeKind::ModalDialog => ipc::send_blocked(window),
            ChangeKind::Tab => {
                let Some(tab) = change.tab else { continue };
                tabs_changed |= change.tab_fields.intersects(drawn);
                let active = browser.active_tab() == Some(tab);
                site_changed |= change.tab_fields.contains(TabFields::URL) && active;
                title_changed |= change.tab_fields.contains(TabFields::TITLE) && active;
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
                    && active
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
    if downloads_changed {
        ipc::send_downloads(window, &browser);
    }
    // A pin or a pop-out shows or hides an extension's button, its mark.
    if extensions_changed {
        ipc::send_extensions(window, &browser);
        ipc::send_anchors(window, &browser);
    }
    title_changed
}

/// What the sidebar draws of a tab, besides its favicon.
fn drawn() -> TabFields {
    TabFields::TITLE
        | TabFields::URL
        | TabFields::LOADING
        | TabFields::HISTORY
        | TabFields::CRASHED
        | TabFields::GROUP
        | TabFields::SPLIT
        | TabFields::PINNED
        | TabFields::ALERTS
        | TabFields::MUTED
}

/// Tells `window`'s page of the changes to the tabs of its Browsers behind
/// the one in front, once a Browser however many changed.
fn apply_behind(window: &BrowserWindow, changes: &[Change]) {
    let front = window.browser();
    let drawn = drawn();
    let mut changed: Vec<Browser> = Vec::new();
    for change in changes {
        let Some(browser) = change.browser.as_ref() else {
            continue;
        };
        if front.as_ref() == Some(browser) || !window.has_browser(browser) {
            continue;
        }
        let tabs_changed = match change.kind {
            ChangeKind::Tabs | ChangeKind::Group | ChangeKind::Split | ChangeKind::Fullscreen => {
                true
            }
            ChangeKind::Tab => {
                if let Some(tab) = change.tab
                    && change.tab_fields.contains(TabFields::FAVICON)
                {
                    ipc::send_favicon(window, tab);
                }
                change.tab_fields.intersects(drawn)
            }
            _ => false,
        };
        if tabs_changed && !changed.contains(browser) {
            changed.push(browser.clone());
        }
    }
    for browser in changed {
        ipc::send_tabs(window, &browser);
    }
}
