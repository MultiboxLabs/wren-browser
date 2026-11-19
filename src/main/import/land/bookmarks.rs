// Bookmarks, landed as pins, as Wren shows bookmarks no other way: the
// bar's as pins of their own, or in a folder, "Bookmarks Bar", from a source
// that says so, and the rest in a folder, "Other Bookmarks", in the space
// the profile used last (a new one, if it has none). A page the
// space has pinned already is left out, so bringing them over again adds
// nothing twice.

use std::rc::Rc;

use wren::ProfileListEntry;

use super::imported;
use crate::app::State;
use crate::import::data::Bookmarks;
use crate::ipc;

/// Lands `bookmarks` in `profile`, the bar's in a folder if
/// `bar_in_folder`, and answers how many pins it made.
pub fn land(
    state: &Rc<State>,
    profile: &ProfileListEntry,
    bookmarks: Bookmarks,
    bar_in_folder: bool,
) -> Result<usize, String> {
    let space = state.db.space_for_imports(profile)?;
    let pins = bookmarks
        .into_pins(bar_in_folder)
        .into_iter()
        .map(imported)
        .collect();
    let added = state.db.add_pins(space, pins)?;
    crate::spaces::changed(state);
    ipc::broadcast_pins(state);
    Ok(added)
}
