// A page's request for permissions, such as location or the camera, as the
// page draws it: a prompt off the page info button
// (components/address/permission-prompt.tsx), in place of Chromium's, or a
// dot on the button for a quiet request. The app answers the request with
// its own (`show_permission_prompt`), and the page answers it here.

use std::rc::Rc;

use serde::{Deserialize, Serialize};
use wren::unstable_ui::UIText;
use wren::{
    Browser, MainThread, PermissionAnswer, PermissionQuiet, Popover, PopoverAnswer, PopoverKind,
    PopoverRequest, WebView,
};

use super::{WindowRef, failed, with_browser};
use crate::app::State;
use crate::shell::BrowserWindow;

/// The open request, as the page draws it.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PermissionPrompt {
    /// The request's, which "permission.answer" names.
    id: u64,
    /// Chrome's title: "example.com wants to".
    title: String,
    permissions: Vec<Requested>,
    /// "Allow this time" is offered for every one of them.
    can_allow_once: bool,
    /// Chromium wants it quiet: the site asked with no click, is known for
    /// abusive requests, or is predicted to be blocked, or you chose quieter
    /// messaging. The button shows a dot, and "permission.showFull" asks
    /// for the full prompt.
    quiet: bool,
}

/// One permission asked for.
#[derive(Serialize)]
struct Requested {
    /// Chromium's name for it: "geolocation", "media-stream-camera".
    id: String,
    /// Chrome's line for it: "Know your location".
    label: String,
}

/// A request, as the page names it.
#[derive(Deserialize)]
struct Named {
    id: u64,
}

/// What "permission.answer" takes.
#[derive(Deserialize)]
struct Answer {
    id: u64,
    /// "allow", "allow-once", "block", or "dismiss" to close it with none.
    answer: String,
}

pub fn handle(web_view: &WebView, window: &WindowRef) {
    // The open request, or null; "permission.state" says when it changes.
    let weak = window.clone();
    let _ = web_view.handle("permission.state", move |()| {
        with_browser(&weak, |_, browser| Ok(prompt(browser)))
    });

    // An answer, and the request closes. An Allow too soon after it opened
    // fails, and the request stays, as Chrome ignores such a click.
    let weak = window.clone();
    let _ = web_view.handle("permission.answer", move |answer: Answer| {
        with_browser(&weak, |_, browser| {
            let chosen = match answer.answer.as_str() {
                "allow" => PermissionAnswer::Allow,
                "allow-once" => PermissionAnswer::AllowThisTime,
                "block" => PermissionAnswer::Block,
                "dismiss" => PermissionAnswer::Dismiss,
                _ => return Err("There is no such answer.".into()),
            };
            find(browser, answer.id)?
                .answer_permission_prompt(chosen)
                .map_err(failed)
        })
    });

    // A quiet request's full prompt, which comes as a new request.
    let weak = window.clone();
    let _ = web_view.handle("permission.showFull", move |named: Named| {
        with_browser(&weak, |_, browser| {
            find(browser, named.id)?
                .show_full_permission_prompt()
                .map_err(failed)
        })
    });
}

/// A page's request for permissions, for `App::popover`: the page's prompt
/// off its page info button, which the page hears of once Chromium's call
/// is over. Whether it is quiet can be read only then: Wren Runtime gives
/// out a request's data once the app has answered it as its own. Chromium's
/// prompt shows while a page has the window, which hides the button.
pub fn show_permission_prompt(
    state: &Rc<State>,
    mt: MainThread,
    request: &PopoverRequest,
) -> PopoverAnswer {
    let Some(window) = state.windows.of(&request.browser) else {
        return PopoverAnswer::Chromium;
    };
    if window.is_full_screen_for_page() {
        return PopoverAnswer::Chromium;
    }
    let state = Rc::downgrade(state);
    let browser = request.browser.clone();
    mt.later(move |_| {
        let Some(state) = state.upgrade() else { return };
        if let Some(window) = state.windows.of(&browser)
            && window.is_front(&browser)
        {
            send_permission(&window, &browser);
        }
    });
    PopoverAnswer::App
}

/// Tells the page a request came or went.
pub fn send_permission(window: &BrowserWindow, browser: &Browser) {
    let _ = window
        .page
        .web_view
        .send("permission.state", &prompt(browser));
}

/// Tells the page no request is open: its space has no Browser.
pub fn send_no_permission(window: &BrowserWindow) {
    let _ = window
        .page
        .web_view
        .send("permission.state", &None::<PermissionPrompt>);
}

fn open(browser: &Browser) -> Option<Popover> {
    browser.open_popover(PopoverKind::Permission)
}

// The open request, if it is still the one the page names.
fn find(browser: &Browser, id: u64) -> Result<Popover, String> {
    open(browser)
        .filter(|popover| popover.id() == id)
        .ok_or_else(|| "The request has gone.".into())
}

fn prompt(browser: &Browser) -> Option<PermissionPrompt> {
    let popover = open(browser)?;
    let state = popover.permission_prompt_state().ok()?;
    Some(PermissionPrompt {
        id: popover.id(),
        title: popover.ui_text(UIText::Title),
        permissions: (0..state.count)
            .map(|index| Requested {
                id: popover.permission_id(index),
                label: popover.permission_text(index, UIText::Label),
            })
            .collect(),
        can_allow_once: state.can_allow_this_time,
        quiet: state.quiet != PermissionQuiet::NotQuiet,
    })
}
