use serde::Serialize;
use wren::{Browser, MainThread, TabGroup, TabGroupColor, WebView};

use super::{MenuAt, WindowRef, failed, menu_call, with_browser};
use crate::menus;

/// A tab group, as the sidebar heads its tabs.
#[derive(Serialize)]
pub struct Group {
    id: String,
    /// "" for an untitled group.
    title: String,
    /// Chromium's name for its colour: "grey", "blue", ...
    color: &'static str,
    collapsed: bool,
}

impl Group {
    pub fn new(group: TabGroup) -> Group {
        let (color, collapsed) = group.visuals().unwrap_or((TabGroupColor::Grey, false));
        Group {
            id: group.to_string(),
            title: group.title(),
            color: menus::color_name(color),
            collapsed,
        }
    }
}

#[derive(serde::Deserialize)]
struct Rename {
    id: String,
    title: String,
}

pub fn handle(web_view: &WebView, window: &WindowRef, mt: MainThread) {
    // A group's context menu, the same way as a tab's ("tabs.menu").
    // "rename" is the page's to do.
    let weak = window.clone();
    let _ = web_view.handle_call("groups.menu", move |call| {
        menu_call(&weak, call, |view, browser, at: MenuAt<String>, done| {
            let group = group(mt, browser, &at.id)?;
            menus::show_group_menu(mt, view, browser, group, (at.x, at.y), done).map_err(failed)
        })
    });

    // Collapses an open group, or opens a collapsed one.
    let weak = window.clone();
    let _ = web_view.handle("groups.toggle", move |id: String| {
        with_browser(&weak, |_, browser| {
            let group = group(mt, browser, &id)?;
            let (color, collapsed) = group.visuals().map_err(failed)?;
            group
                .set_visuals(&group.title(), color, !collapsed)
                .map_err(failed)
        })
    });

    let weak = window.clone();
    let _ = web_view.handle("groups.rename", move |rename: Rename| {
        with_browser(&weak, |_, browser| {
            let group = group(mt, browser, &rename.id)?;
            let (color, collapsed) = group.visuals().map_err(failed)?;
            group
                .set_visuals(rename.title.trim(), color, collapsed)
                .map_err(failed)
        })
    });
}

// The group an ID from the page names, if it is the Browser's.
fn group(mt: MainThread, browser: &Browser, id: &str) -> Result<TabGroup, String> {
    TabGroup::parse(mt, id)
        .filter(|group| group.browser().as_ref() == Some(browser))
        .ok_or_else(|| "There is no such group.".into())
}
