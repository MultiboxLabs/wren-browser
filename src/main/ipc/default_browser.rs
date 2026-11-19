// Whether Wren is the browser macOS opens web links with, and asking the user
// to make it so, as the Library does. macOS asks the user itself.
// Wren asks again each time the app becomes active, so a change made in
// System Settings is seen too; `defaultBrowser.changed` tells every window
// either way.

use serde::Serialize;
use wren::{DefaultBrowserState, Error, MainThread, PageCall, WebView};

use super::failed;
use crate::app::State;

/// What `defaultBrowser.get`, `.set` and `.changed` say.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DefaultBrowser {
    /// Null while macOS does not say.
    is_default: Option<bool>,
    /// False where policy keeps the user from making it so.
    can_set: bool,
}

impl DefaultBrowser {
    fn of(state: DefaultBrowserState) -> DefaultBrowser {
        DefaultBrowser {
            is_default: match state.state {
                wren::DefaultBrowser::Yes => Some(true),
                wren::DefaultBrowser::No => Some(false),
                wren::DefaultBrowser::Unknown => None,
            },
            can_set: state.can_set,
        }
    }
}

pub fn handle(web_view: &WebView, mt: MainThread) {
    // Whether it is now.
    let _ = web_view.handle_call("defaultBrowser.get", move |call| {
        mt.default_browser_state(move |result| answer(call, result));
    });

    // Asks the user to make it so, and answers once macOS's prompt goes,
    // with what they chose. Every window is told by the change that follows
    // (`broadcast_default_browser`).
    let _ = web_view.handle_call("defaultBrowser.set", move |call| {
        mt.set_as_default_browser(move |result| answer(call, result));
    });
}

// A page that went before its answer is no error.
fn answer(call: PageCall, result: Result<DefaultBrowserState, Error>) {
    let _ = match result {
        Ok(state) => call.answer(&DefaultBrowser::of(state)),
        Err(error) => call.fail(&failed(error)),
    };
}

/// Tells every window's page whether Wren is the default browser, as it
/// changed (`settings::check_default_browser`).
pub fn broadcast_default_browser(state: &State, default: DefaultBrowserState) {
    let default = DefaultBrowser::of(default);
    for window in state.windows.all() {
        let _ = window
            .page
            .web_view
            .send("defaultBrowser.changed", &default);
    }
}
