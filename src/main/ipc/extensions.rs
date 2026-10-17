use std::rc::Rc;

use serde::{Deserialize, Serialize};
use wren::{Browser, WebView};

use super::{failed, png_url, with_browser};
use crate::app::State;
use crate::window::MainWindow;

/// An extension's action, as the page info popover lists it and the
/// address field shows it while it is pinned or popped out.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Action {
    id: String,
    name: String,
    pinned: bool,
    /// Pinned by policy: it cannot be unpinned.
    force_pinned: bool,
    /// Shown in the address field although not pinned, while its popup
    /// opens, as Chrome pops its button out.
    popped_out: bool,
    /// As Chrome draws its 28-point button: the icon, with its badge.
    icon: Option<String>,
}

#[derive(Deserialize)]
struct Pin {
    id: String,
    pinned: bool,
}

pub fn handle(web_view: &WebView, state: &Rc<State>) {
    // The Browser's extensions with an action, in their order;
    // "extensions.actions" says when they change.
    let weak = Rc::downgrade(state);
    let _ = web_view.handle("extensions.actions", move |()| {
        with_browser(&weak, |_, browser| Ok(actions(browser)))
    });

    // As a click on its button: its popup, below its anchor.
    let weak = Rc::downgrade(state);
    let _ = web_view.handle("extensions.click", move |id: String| {
        with_browser(&weak, |_, browser| {
            browser.click_extension_action(&id).map_err(failed)
        })
    });

    // Pins it to the address field, or unpins it; its button follows, with
    // its mark ("extensions.actions" says so).
    let weak = Rc::downgrade(state);
    let _ = web_view.handle("extensions.setPinned", move |pin: Pin| {
        with_browser(&weak, |_, browser| {
            browser
                .set_extension_action_pinned(&pin.id, pin.pinned)
                .map_err(failed)
        })
    });

    // Chromium's menu for it (pin, options, site access, remove), at its
    // anchor.
    let weak = Rc::downgrade(state);
    let _ = web_view.handle("extensions.menu", move |id: String| {
        with_browser(&weak, |_, browser| {
            browser.show_extension_action_menu(&id).map_err(failed)
        })
    });
}

/// Tells the page the extensions' actions changed: which there are, their
/// pins, icons or badges.
pub fn send_extensions(main: &MainWindow, browser: &Browser) {
    let _ = main
        .page
        .web_view
        .send("extensions.actions", &actions(browser));
}

fn actions(browser: &Browser) -> Vec<Action> {
    browser
        .extension_action_ids()
        .into_iter()
        .map(|id| {
            let state = browser.extension_action_state(&id).ok();
            Action {
                name: browser.extension_action_name(&id),
                pinned: state.is_some_and(|state| state.pinned || state.force_pinned),
                force_pinned: state.is_some_and(|state| state.force_pinned),
                popped_out: state.is_some_and(|state| state.popped_out),
                icon: browser
                    .extension_action_icon_png(&id, 28, 2.0, true)
                    .map(png_url),
                id,
            }
        })
        .collect()
}
