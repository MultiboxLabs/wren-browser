// A download's menu, in the shelf and the Library.

use wren::{Download, DownloadAction, Error, MainThread, MenuItem, NativeView};

use crate::clipboard;
use crate::downloads;

/// Shows a download's menu at `point` in the page's `view`, and does what
/// is chosen.
pub fn show_download_menu(
    mt: MainThread,
    view: NativeView,
    download: Download,
    point: (f64, f64),
    done: impl FnOnce(Option<String>) + 'static,
) -> Result<(), Error> {
    let state = download.state()?;
    let available = state.available();
    let mut items = Vec::new();
    if available.contains(DownloadAction::OPEN) {
        items.push(MenuItem::item("open", "Open"));
    }
    if available.contains(DownloadAction::SHOW_IN_FINDER) {
        items.push(MenuItem::item("show", "Show in Finder"));
    }
    items.push(MenuItem::item("copy-link", "Copy Download Link"));
    if available.contains(DownloadAction::OPEN_WHEN_DONE) {
        items.extend([
            MenuItem::Separator,
            MenuItem::Item {
                id: "open-when-done".into(),
                label: "Always Open Files of This Type".into(),
                enabled: true,
                checked: state.open_when_done,
                hidden: false,
                key: None,
            },
        ]);
    }
    if downloads::removable(&state) {
        items.extend([
            MenuItem::Separator,
            MenuItem::item("remove", "Remove from List"),
        ]);
    }
    mt.show_context_menu(&items, view, point, move |chosen| {
        let _ = match chosen.as_deref() {
            Some("open") => download.perform(DownloadAction::OPEN),
            Some("show") => download.perform(DownloadAction::SHOW_IN_FINDER),
            Some("open-when-done") => download.perform(DownloadAction::OPEN_WHEN_DONE),
            Some("copy-link") => clipboard::copy_link(&download.url(), None, state.off_the_record),
            Some("remove") => downloads::remove(download),
            _ => Ok(()),
        };
        done(chosen);
    })
}
