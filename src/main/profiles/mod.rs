// The profiles: what follows a change to their list, and a profile opening.
// Each follows the password manager and autofill settings (filling.rs).

pub mod filling;

use std::rc::Rc;

use wren::{MainThread, Profile};

use crate::app::State;
use crate::ipc;
use crate::windows;

/// The list of profiles changed. A profile deleted elsewhere takes its
/// spaces and windows with it. One renamed is told too: the page and the
/// main menu show profiles' names.
pub fn list_changed(state: &Rc<State>, mt: MainThread) {
    if state.db.sync_profiles(&mt.profile_list()) {
        state.leave_gone_spaces(None);
    }
    state.leave_gone_profiles(mt);
    ipc::broadcast_spaces(state);
}

/// `profile` opened: it follows the filling settings, and keeps its session
/// data.
pub fn opened(profile: &Profile) {
    filling::opened(profile);
    windows::keep_session_data(profile);
}
