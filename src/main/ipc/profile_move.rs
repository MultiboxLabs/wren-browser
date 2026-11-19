// Asking before tabs go to another profile, where they are made again
// without their history (sidebar/items/crossing.rs): a drop of tabs of the list
// (items.rs), or a Mini Wren's page opened as a tab
// (windows/mini_wren/as_tab.rs). The page of the window it happens in asks
// ("profileMove.ask", components/profile-move-dialog.tsx), and the move
// waits for its answer ("profileMove.answer"), unless the user said not to
// ask, which Settings' Ask Before Moving to Another Profile turns back on.
// src/renderer/ipc/profile-move.ts is the page's side.

use std::cell::RefCell;
use std::collections::HashMap;

use wren::WebView;

use super::{WindowRef, give_back_keyboard, with_window};
use crate::app::State;
use crate::sidebar::items::Crossing;
use crate::windows::WindowId;

/// A move waiting for the page's answer: it goes if the answer is yes.
type Waiting = Box<dyn FnOnce(bool)>;

thread_local! {
    // The move each window's page asks about (`ask_before_profile_move`).
    static ASKING: RefCell<HashMap<WindowId, Waiting>> = RefCell::default();
}

/// Calls `answered` with whether a move that makes `crossing` again in
/// another profile goes: at once if it makes nothing, or the user said not
/// to ask, or else once window `id`'s page has its answer. A page asks one
/// at a time: a move while it asks does not go.
pub fn ask_before_profile_move(
    state: &State,
    id: WindowId,
    crossing: Option<Crossing>,
    answered: impl FnOnce(bool) + 'static,
) {
    let asks = state
        .db
        .settings()
        .is_ok_and(|settings| settings.ask_before_profile_move);
    let Some(crossing) = crossing.filter(|_| asks) else {
        return answered(true);
    };
    let Some(window) = state.windows.get(id) else {
        return answered(false);
    };
    if ASKING.with(|asking| asking.borrow().contains_key(&id)) {
        return answered(false);
    }
    ASKING.with(|asking| asking.borrow_mut().insert(id, Box::new(answered)));
    // The dialog takes the keyboard, for Return and Escape.
    let _ = window.page.web_view.focus();
    let _ = window.page.web_view.send("profileMove.ask", &crossing);
}

/// Forgets the move window `id`'s page asks about, as the window closes: no
/// answer can come, and the move does not go.
pub fn forget_move_question(id: WindowId) {
    answer(id, false);
}

pub fn handle(web_view: &WebView, window: &WindowRef) {
    // The page's answer to what it asks before a move.
    let weak = window.clone();
    let _ = web_view.handle("profileMove.answer", move |go: bool| {
        with_window(&weak, |found| {
            if !answer(found.id, go) {
                return Err("The window asks nothing.".into());
            }
            if let Some(browser) = found.browser() {
                give_back_keyboard(&browser);
            }
            Ok(())
        })
    });
}

// Gives window `id`'s move the page's answer, and answers whether one was
// asked.
fn answer(id: WindowId, go: bool) -> bool {
    let answered = ASKING.with(|asking| asking.borrow_mut().remove(&id));
    answered.map(|answered| answered(go)).is_some()
}
