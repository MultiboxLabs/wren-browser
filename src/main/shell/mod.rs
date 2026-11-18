// The browser's own windows: what a browser window holds, the Browsers it
// shows and where (browser.rs, place.rs, tag.rs), whether the pointer is
// over its sidebar (sidebar_hover.rs), what its page has been told of its
// tabs (page_tabs.rs), and the list of them (list.rs). The window round its page is the platform's
// (`platform::PageWindow`); what the app does with its windows is
// windows/'s.

mod browser;
mod list;
mod page_tabs;
mod place;
mod sidebar_hover;
mod tag;

pub use browser::{BrowserWindow, MiniWren, WindowId, marks};
pub use list::Windows;
pub use place::Place;
pub use sidebar_hover::SidebarRegions;
pub use tag::Tag;
