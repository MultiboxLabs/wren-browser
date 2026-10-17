// The calls the main window's page makes (`wren.invoke`), each by name.
// src/renderer/ipc.ts is the page's side; keep the two together.

use std::rc::{Rc, Weak};

use wren::{MainThread, WebView};

use crate::app::State;

pub fn handle_ui(web_view: &WebView, state: &Rc<State>, mt: MainThread) {
    let weak = Rc::downgrade(state);
    let _ = web_view.handle("counter.get", move |()| {
        with_state(&weak, |state| Ok(state.counter.get()))
    });

    let weak = Rc::downgrade(state);
    let _ = web_view.handle("counter.add", move |amount: i64| {
        with_state(&weak, |state| {
            let count = state
                .counter
                .get()
                .checked_add(amount)
                .ok_or("The counter would overflow.")?;
            state.counter.set(count);
            Ok(count)
        })
    });

    let weak = Rc::downgrade(state);
    let _ = web_view.handle("game.open", move |()| {
        with_state(&weak, |state| {
            mt.later(move |_| state.open_game(mt));
            Ok(())
        })
    });
}

// Runs a handler with the app's state, or fails the call once it is gone.
fn with_state<A>(
    state: &Weak<State>,
    handler: impl FnOnce(Rc<State>) -> Result<A, &'static str>,
) -> Result<A, &'static str> {
    handler(state.upgrade().ok_or("The app is closing.")?)
}
