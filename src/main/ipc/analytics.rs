// The events only a window's page knows of (analytics/event.rs), which the
// page records here. The page names one of these alone: anything else fails
// to be read, and is not sent.

use serde::Deserialize;
use wren::WebView;

use super::WindowRef;
use crate::analytics::{Event, LibrarySection};

#[derive(Deserialize)]
#[serde(tag = "event", rename_all = "snake_case")]
enum PageEvent {
    LibraryOpened { section: LibrarySection },
    DownloadsShelfOpened,
}

pub fn handle(web_view: &WebView, window: &WindowRef) {
    let weak = window.clone();
    let _ = web_view.handle("analytics.record", move |event: PageEvent| {
        let event = match event {
            PageEvent::LibraryOpened { section } => Event::LibraryOpened { section },
            PageEvent::DownloadsShelfOpened => Event::DownloadsShelfOpened,
        };
        weak.state()?.analytics.record(event);
        Ok::<_, String>(())
    });
}
