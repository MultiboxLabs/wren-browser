// What Chromium's changes mean for a window's page: each window takes the
// changes of the Browser it shows in front, and tells its page what it draws.
// Of its Browsers behind, it tells only their tabs, which the sidebar draws
// as it swipes to their spaces. Each Browser's tabs are told once a batch,
// in as few messages as say what changed (`ipc::TabChanges`).

use wren::{Browser, Change, ChangeKind, TabFields};

use crate::ipc;
use crate::shell::BrowserWindow;

/// Tells `window`'s page of the changes to its Browser in front, and
/// answers whether the window's title may have changed with them: the
/// active tab's title, or which tab is active, or whether one is.
pub fn apply(window: &BrowserWindow, changes: &[Change]) -> bool {
    // A performance run counts the batches that send the page its tabs.
    let Some(counts) = &window.perf_counts else {
        return apply_batch(window, changes);
    };
    let before = counts.messages();
    let title_changed = apply_batch(window, changes);
    counts.batch_done(before);
    title_changed
}

fn apply_batch(window: &BrowserWindow, changes: &[Change]) -> bool {
    apply_behind(window, changes);
    let Some(browser) = window.browser() else {
        return false;
    };
    let mut tab_changes = ipc::TabChanges::default();
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
        tab_changes.hear(change);
        match change.kind {
            ChangeKind::Tabs => {
                site_changed = true;
                title_changed = true;
            }
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
                ipc::send_permission(window, &browser);
                ipc::send_find(window, &browser);
            }
            ChangeKind::Find => ipc::send_find(window, &browser),
            ChangeKind::DownloadButton => ipc::send_indicator(window, &browser),
            ChangeKind::ModalDialog => ipc::send_blocked(window),
            ChangeKind::Tab => {
                let Some(tab) = change.tab else { continue };
                let active = browser.active_tab() == Some(tab);
                site_changed |= change.tab_fields.contains(TabFields::URL) && active;
                title_changed |= change.tab_fields.contains(TabFields::TITLE) && active;
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
    tab_changes.send(window, &browser);
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

/// Forgets what `window` keeps of its tabs (`PageTabs`) that `changes`
/// changed, or closed or took from its Browsers. Called for each batch
/// before anything tells the page of it, so nothing sends what was.
pub fn forget_changed(window: &BrowserWindow, changes: &[Change]) {
    let mut closed = false;
    for change in changes {
        let Some(browser) = &change.browser else {
            continue;
        };
        if !window.has_browser(browser) {
            continue;
        }
        if let Some(tab) = change.tab {
            window.page_tabs.changed(tab, change.tab_fields);
        }
        closed |= change.kind == ChangeKind::Tabs;
    }
    if closed {
        window.page_tabs.forget_closed(&window.browsers());
    }
}

/// Tells `window`'s page of the changes to the tabs of its Browsers behind
/// the one in front.
fn apply_behind(window: &BrowserWindow, changes: &[Change]) {
    let front = window.browser();
    let mut behind: Vec<(Browser, ipc::TabChanges)> = Vec::new();
    for change in changes {
        let Some(browser) = change.browser.as_ref() else {
            continue;
        };
        if front.as_ref() == Some(browser) || !window.has_browser(browser) {
            continue;
        }
        let at = match behind.iter().position(|(each, _)| each == browser) {
            Some(at) => at,
            None => {
                behind.push((browser.clone(), ipc::TabChanges::default()));
                behind.len() - 1
            }
        };
        behind[at].1.hear(change);
    }
    for (browser, tab_changes) in behind {
        tab_changes.send(window, &browser);
    }
}
