// What the page asks of a peek in front of another tab (peeks/): its three
// buttons, a click on the tab behind it, which closes it as Close does, and
// a picture of its page, which it is drawn by as it goes.
// src/renderer/ipc/peeks.ts is the page's side. What the page is told of the
// peeks comes with its tabs (tabs.rs).

use wren::{MainThread, WebView};

use super::browser::tab;
use super::{WindowRef, with_browser};
use crate::peeks;

pub fn handle(web_view: &WebView, window: &WindowRef, mt: MainThread) {
    // The peek closes, and the tab behind it is shown again.
    let weak = window.clone();
    let _ = web_view.handle("peeks.close", move |id: i32| {
        with_browser(&weak, |_, browser| peeks::close(tab(mt, browser, id)?))
    });

    // A picture of the peek's page as it is: the ID it is served at
    // (`previewUrl`), once it is taken, or null for none.
    let weak = window.clone();
    let _ = web_view.handle_call("peeks.picture", move |call| {
        let peek = call
            .value::<i32>()
            .map_err(|error| error.to_string())
            .and_then(|id| with_browser(&weak, |_, browser| tab(mt, browser, id)));
        let peek = match peek {
            Ok(peek) => peek,
            Err(error) => {
                let _ = call.fail(&error);
                return;
            }
        };
        peeks::picture(peek, move |picture| {
            let _ = call.answer(&picture);
        });
    });

    // The peek becomes a tab of the list.
    let weak = window.clone();
    let _ = web_view.handle("peeks.expand", move |id: i32| {
        with_browser(&weak, |_, browser| {
            let state = weak.state()?;
            peeks::expand(&state, mt, browser, tab(mt, browser, id)?)
        })
    });

    // The peek and the tab behind it become a split of the list.
    let weak = window.clone();
    let _ = web_view.handle("peeks.split", move |id: i32| {
        with_browser(&weak, |_, browser| {
            let state = weak.state()?;
            peeks::split(&state, mt, browser, tab(mt, browser, id)?)
        })
    });
}
