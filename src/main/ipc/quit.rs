// Warn Before Quitting: Chromium decides when ⌘Q warns (Chrome's setting is
// on), and the app asks in the page of the window in front (components/
// quit-dialog.tsx) in place of Chromium's "Hold ⌘Q to Quit" (`App::
// quit_prompt`). The quit waits for the page's answer. ⌘Q again while it
// asks quits, as Chrome's warning does on a second press.

use std::rc::Rc;

use serde::{Deserialize, Serialize};
use wren::{MainThread, PopoverAnswer, QuitPrompt, WebView};

use super::{WindowRef, give_back_keyboard, with_window};
use crate::app::State;
use crate::window::WindowId;

/// The prompt open, and the window whose page asks it.
pub struct OpenQuitPrompt {
    prompt: QuitPrompt,
    window: WindowId,
}

/// The dialog as the page shows it.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Shown {
    /// It offers Always Quit, which turns the warning off: not when policy
    /// sets it.
    always_quit: bool,
}

/// The page's answer.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
enum Answer {
    Quit,
    /// Quit, and never warn again.
    Always,
    Cancel,
}

/// Whose warning it is, for `App::quit_prompt`: the page of the window in
/// use asks, a popup's too, or else of the window in front, once Chromium's
/// call is over. With no window open there is nothing to lose, and nowhere
/// to ask: it quits.
pub fn show_quit_prompt(state: &Rc<State>, mt: MainThread, prompt: &QuitPrompt) -> PopoverAnswer {
    if prompt.again {
        return PopoverAnswer::None;
    }
    let Some(window) = state.windows.in_use().or_else(|| state.windows.front()) else {
        return PopoverAnswer::None;
    };
    *state.quit_prompt.borrow_mut() = Some(OpenQuitPrompt {
        prompt: prompt.clone(),
        window: window.id,
    });
    let state = Rc::downgrade(state);
    let id = window.id;
    mt.later(move |mt| {
        let Some(state) = state.upgrade() else { return };
        let Some(window) = state.windows.get(id) else {
            // It went in the meantime: the quit goes on without asking.
            return answer_open(&state, true);
        };
        let shown = Shown {
            always_quit: !mt.quit_warning().managed,
        };
        // The dialog takes the keyboard, for Return and Escape.
        let _ = window.page.web_view.focus();
        let _ = window.page.web_view.send("quit.show", &shown);
    });
    PopoverAnswer::App
}

/// A window closing while its page asks: the quit goes on, as it would with
/// no window to ask in.
pub fn quit_window_closing(state: &State, id: WindowId) {
    if asks(state, id) {
        answer_open(state, true);
    }
}

pub fn handle(web_view: &WebView, window: &WindowRef, mt: MainThread) {
    // The page's answer to the dialog it shows.
    let weak = window.clone();
    let _ = web_view.handle("quit.answer", move |answer: Answer| {
        with_window(&weak, |found| {
            let state = weak.state()?;
            if !asks(&state, found.id) {
                return Err("The window asks nothing.".into());
            }
            // The quit goes on even if the warning stays: the dialog is
            // gone either way.
            if let Answer::Always = answer
                && let Err(error) = mt.set_quit_warning(false)
            {
                eprintln!("Wren could not turn off Warn Before Quitting: {error:?}");
            }
            let quit = !matches!(answer, Answer::Cancel);
            if !quit && let Some(browser) = found.browser() {
                give_back_keyboard(&browser);
            }
            answer_open(&state, quit);
            Ok(())
        })
    });
}

// Whether window `id`'s page asks the prompt open.
fn asks(state: &State, id: WindowId) -> bool {
    state
        .quit_prompt
        .borrow()
        .as_ref()
        .is_some_and(|open| open.window == id)
}

// Answers the prompt open, if there is one, and forgets it.
fn answer_open(state: &State, quit: bool) {
    let open = state.quit_prompt.borrow_mut().take();
    if let Some(open) = open {
        let _ = open.prompt.answer(quit);
    }
}
