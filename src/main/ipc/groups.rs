use serde::Serialize;
use wren::{Browser, MainThread, TabGroup, TabGroupColor, WebView};

use super::{WindowRef, failed, with_browser};
use crate::sidebar::items::carry;
use crate::tabs;

/// A tab group, as the sidebar heads its tabs.
#[derive(Serialize)]
pub struct Group {
    id: String,
    /// "" for an untitled group.
    title: String,
    /// Chromium's name for its colour: "grey", "blue", ...
    color: &'static str,
    collapsed: bool,
    /// What a drag of it to another window names it by (sidebar/items/carry.rs).
    carry: Option<String>,
}

impl Group {
    pub fn new(group: TabGroup) -> Group {
        let (color, collapsed) = group.visuals().unwrap_or((TabGroupColor::Grey, false));
        Group {
            id: group.to_string(),
            title: group.title(),
            color: tabs::groups::color_name(color),
            collapsed,
            carry: carry::group_token(group),
        }
    }
}

#[derive(serde::Deserialize)]
struct Rename {
    id: String,
    title: String,
}

pub fn handle(web_view: &WebView, window: &WindowRef, mt: MainThread) {
    // Collapses an open group, or opens a collapsed one.
    let weak = window.clone();
    let _ = web_view.handle("groups.toggle", move |id: String| {
        with_browser(&weak, |_, browser| {
            tabs::groups::toggle(group(mt, browser, &id)?).map_err(failed)
        })
    });

    let weak = window.clone();
    let _ = web_view.handle("groups.rename", move |rename: Rename| {
        with_browser(&weak, |_, browser| {
            tabs::groups::rename(group(mt, browser, &rename.id)?, &rename.title).map_err(failed)
        })
    });
}

// The group an ID from the page names, if it is the Browser's.
fn group(mt: MainThread, browser: &Browser, id: &str) -> Result<TabGroup, String> {
    tabs::group(mt, browser, id).ok_or_else(|| "There is no such group.".into())
}
