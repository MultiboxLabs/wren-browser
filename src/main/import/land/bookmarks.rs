// Bookmarks, landed as pins, as Wren shows bookmarks no other way: the
// bar's as pins of their own, and the rest in a folder, "Other Bookmarks",
// in the space the profile used last (a new one, if it has none). A page the
// space has pinned already is left out, so bringing them over again adds
// nothing twice.

use std::rc::Rc;

use wren::ProfileListEntry;

use super::imported;
use crate::app::State;
use crate::import::data::Bookmarks;
use crate::ipc;

/// Lands `bookmarks` in `profile`, and answers how many pins it made.
pub fn land(
    state: &Rc<State>,
    profile: &ProfileListEntry,
    bookmarks: Bookmarks,
) -> Result<usize, String> {
    let space = state.db.space_for_imports(profile)?;
    let pins = bookmarks.into_pins().into_iter().map(imported).collect();
    let added = state.db.add_pins(space, pins)?;
    ipc::broadcast_spaces(state);
    ipc::broadcast_pins(state);
    Ok(added)
}
