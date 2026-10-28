// Closing a key window of its own, which none of the app's page windows is:
// AppKit's About panel, or a DevTools window.

use objc2::MainThreadMarker;
use objc2::rc::Retained;
use objc2_app_kit::{NSApplication, NSWindowStyleMask};

use super::PageWindow;

pub fn close_other_key_window<'a>(pages: impl IntoIterator<Item = &'a PageWindow>) -> bool {
    let app = NSApplication::sharedApplication(MainThreadMarker::new().unwrap());
    let Some(key) = app.keyWindow() else {
        return false;
    };
    if key.sheetParent().is_some()
        || key.parentWindow().is_some()
        || !key.styleMask().contains(NSWindowStyleMask::Closable)
        || pages
            .into_iter()
            .any(|page| Retained::as_ptr(&page.window) == Retained::as_ptr(&key))
    {
        return false;
    }
    key.performClose(None);
    true
}
