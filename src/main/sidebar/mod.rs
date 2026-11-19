// The sidebar: saving its state, whether the pointer is over a window's
// floating one (hover.rs), and what a drop or an item's menu does to a tab,
// a group or a pin (items/). Its saved state is kept by db/sidebar.rs, and
// the page's calls are ipc/sidebar.rs's and ipc/items.rs's.

pub mod hover;
pub mod items;

use crate::analytics::Event;
use crate::app::State;
use crate::db::SidebarState;

/// Saves the sidebar's state as the page has it, and counts a change of
/// whether it is docked. It is saved as its width is dragged too, which
/// counts nothing.
pub fn save_state(state: &State, saved: &SidebarState) -> Result<(), String> {
    let docked = saved.is_docked();
    let toggled = state
        .sidebar
        .load()
        .is_some_and(|last| last.is_docked() != docked);
    state
        .sidebar
        .save(saved)
        .map_err(|error| error.to_string())?;
    if toggled {
        state.analytics.record(Event::SidebarToggled { docked });
    }
    Ok(())
}
