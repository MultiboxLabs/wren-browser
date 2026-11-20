// A download's menu, in the shelf and the Library. What is chosen is done
// by `downloads::choose`.

use wren::{DownloadAction, DownloadState, Error, MainThread, MenuItem, NativeView};

use crate::downloads;

pub const OPEN: &str = "open";
pub const SHOW: &str = "show";
pub const COPY_LINK: &str = "copy-link";
pub const OPEN_WHEN_DONE: &str = "open-when-done";
pub const REMOVE: &str = "remove";

/// Shows the menu of a download, as `state` has it, at `point` in the
/// page's `view`, and hands what is chosen to `done`.
pub fn show_download_menu(
    mt: MainThread,
    view: NativeView,
    state: &DownloadState,
    point: (f64, f64),
    done: impl FnOnce(Option<String>) + 'static,
) -> Result<(), Error> {
    let available = state.available();
    let mut items = Vec::new();
    if available.contains(DownloadAction::OPEN) {
        items.push(MenuItem::item(OPEN, "Open"));
    }
    if available.contains(DownloadAction::SHOW_IN_FINDER) {
        items.push(MenuItem::item(SHOW, "Show in Finder"));
    }
    items.push(MenuItem::item(COPY_LINK, "Copy Download Link"));
    if available.contains(DownloadAction::OPEN_WHEN_DONE) {
        items.extend([
            MenuItem::Separator,
            MenuItem::Item {
                id: OPEN_WHEN_DONE.into(),
                label: "Always Open Files of This Type".into(),
                enabled: true,
                checked: state.open_when_done,
                hidden: false,
                key: None,
            },
        ]);
    }
    if downloads::removable(state) {
        items.extend([
            MenuItem::Separator,
            MenuItem::item(REMOVE, "Remove from List"),
        ]);
    }
    super::show_context_menu(mt, view, point, &items, done)
}
