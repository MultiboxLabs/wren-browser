// The window of Chromium's undocked DevTools: a plain NSWindow, whose
// content is the DevTools tab's own view.

use objc2::rc::Retained;
use objc2::runtime::ProtocolObject;
use objc2::{MainThreadMarker, MainThreadOnly};
use objc2_app_kit::{
    NSAutoresizingMaskOptions, NSBackingStoreType, NSView, NSWindow, NSWindowStyleMask,
};
use objc2_foundation::{NSPoint, NSRect, NSSize, NSString};
use wren::{Browser, NativeView};

use super::delegate::WindowDelegate;

pub struct DevToolsWindow {
    browser: Browser,
    window: Retained<NSWindow>,
    _delegate: Retained<WindowDelegate>,
}

impl DevToolsWindow {
    pub fn new(browser: Browser) -> Self {
        let mtm = MainThreadMarker::new().unwrap();
        let size = browser
            .requested_bounds()
            .map_or(NSSize::new(800.0, 600.0), |bounds| {
                NSSize::new(bounds.width, bounds.height)
            });
        let window = unsafe {
            NSWindow::initWithContentRect_styleMask_backing_defer(
                NSWindow::alloc(mtm),
                NSRect::new(NSPoint::new(0.0, 0.0), size),
                NSWindowStyleMask::Titled
                    | NSWindowStyleMask::Closable
                    | NSWindowStyleMask::Resizable
                    | NSWindowStyleMask::Miniaturizable,
                NSBackingStoreType::Buffered,
                false,
            )
        };
        unsafe { window.setReleasedWhenClosed(false) };
        window.setTitle(&NSString::from_str("DevTools"));
        window.center();
        let closing = browser.clone();
        let delegate = WindowDelegate::new(
            mtm,
            Box::new(move || {
                let _ = closing.close();
                false // browser_closed drops the window after Chromium closes.
            }),
        );
        window.setDelegate(Some(ProtocolObject::from_ref(&*delegate)));
        let content = window.contentView().unwrap();
        browser.attach_to_view(unsafe {
            NativeView::from_raw(Retained::as_ptr(&content).cast_mut().cast())
        });
        let shown = Self {
            browser,
            window,
            _delegate: delegate,
        };
        shown.show_active_tab();
        shown.window.makeKeyAndOrderFront(None);
        shown
    }

    pub fn show_active_tab(&self) {
        let Some(tab) = self.browser.active_tab() else {
            return;
        };
        let Some(view) = tab.view() else { return };
        let view: Retained<NSView> = unsafe { Retained::retain(view.as_ptr().cast()) }.unwrap();
        let content = self.window.contentView().unwrap();
        for other in content.subviews() {
            if other != view {
                other.removeFromSuperview();
            }
        }
        if unsafe { view.superview() }.as_deref() != Some(&*content) {
            content.addSubview(&view);
            view.setFrame(content.bounds());
            view.setAutoresizingMask(
                NSAutoresizingMaskOptions::ViewWidthSizable
                    | NSAutoresizingMaskOptions::ViewHeightSizable,
            );
            let _ = tab.focus();
        }
        let title = tab.title();
        if !title.is_empty() {
            self.window.setTitle(&NSString::from_str(&title));
        }
    }
}

impl Drop for DevToolsWindow {
    fn drop(&mut self) {
        self.browser.attach_to_view(None);
        self.window.setDelegate(None);
        self.window.close();
    }
}
