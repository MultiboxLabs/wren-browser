// A window showing one page in a web view.

use objc2::rc::Retained;
use objc2::runtime::{NSObject, ProtocolObject};
use objc2::{DefinedClass, MainThreadMarker, MainThreadOnly, define_class, msg_send};
use objc2_app_kit::{
    NSApplication, NSAutoresizingMaskOptions, NSBackingStoreType, NSView, NSWindow,
    NSWindowDelegate, NSWindowStyleMask,
};
use objc2_foundation::{NSObjectProtocol, NSPoint, NSRect, NSSize, NSString};
use wren::{Profile, TabCrash, WebView, WebViewKind, WebViewOptions};

use crate::pages::{Page, dev_url};

/// A window showing one page. Its web view drops first, which takes the page
/// out of the window.
pub struct PageWindow {
    pub web_view: WebView,
    pub window: Retained<NSWindow>,
    // A window holds its delegate weakly.
    _delegate: Retained<WindowDelegate>,
}

impl PageWindow {
    /// `should_close` answers the window's close button.
    pub fn open(
        profile: &Profile,
        page: &Page,
        should_close: impl Fn() -> bool + 'static,
    ) -> Option<PageWindow> {
        let mtm = MainThreadMarker::new().unwrap();
        let options = WebViewOptions {
            kind: WebViewKind::BrowserUi,
            messages: page.messages,
            // Trust the dev server only when asked to, and only for a page
            // that needs it: a trusted origin with no option on is refused.
            trusted_origins: dev_url().filter(|_| page.messages).into_iter().collect(),
            ..Default::default()
        };
        let web_view = WebView::new(profile, &page.url(), &options)?;

        let window = unsafe {
            NSWindow::initWithContentRect_styleMask_backing_defer(
                NSWindow::alloc(mtm),
                NSRect::new(
                    NSPoint::new(0.0, 0.0),
                    NSSize::new(page.size.0, page.size.1),
                ),
                NSWindowStyleMask::Titled
                    | NSWindowStyleMask::Closable
                    | NSWindowStyleMask::Resizable
                    | NSWindowStyleMask::Miniaturizable,
                NSBackingStoreType::Buffered,
                false,
            )
        };
        unsafe { window.setReleasedWhenClosed(false) };
        window.setTitle(&NSString::from_str(page.title));
        window.center();
        let delegate = WindowDelegate::new(mtm, Box::new(should_close));
        window.setDelegate(Some(ProtocolObject::from_ref(&*delegate)));

        let content = window.contentView().unwrap();
        let view: Retained<NSView> =
            unsafe { Retained::retain(web_view.view().as_ptr().cast()) }.unwrap();
        view.setFrame(content.bounds());
        view.setAutoresizingMask(
            NSAutoresizingMaskOptions::ViewWidthSizable
                | NSAutoresizingMaskOptions::ViewHeightSizable,
        );
        content.addSubview(&view);

        // Shows the window once the page has drawn, so it never opens blank;
        // on a failed load or a crash too, or it would never open.
        let shown = window.clone();
        web_view.set_changed(Some(Box::new(move |state| {
            if (state.drawn || state.load_error != 0 || state.crash != TabCrash::None)
                && !shown.isVisible()
            {
                shown.makeKeyAndOrderFront(None);
                NSApplication::sharedApplication(MainThreadMarker::new().unwrap()).activate();
            }
        })));
        let _ = web_view.focus();

        Some(PageWindow {
            web_view,
            window,
            _delegate: delegate,
        })
    }
}

impl Drop for PageWindow {
    fn drop(&mut self) {
        self.window.setDelegate(None);
        self.window.close();
    }
}

// Hands a window's close button to the closure it was made with.
define_class!(
    #[unsafe(super(NSObject))]
    #[thread_kind = MainThreadOnly]
    #[name = "WrenWindowDelegate"]
    #[ivars = Box<dyn Fn() -> bool>]
    struct WindowDelegate;

    unsafe impl NSObjectProtocol for WindowDelegate {}

    unsafe impl NSWindowDelegate for WindowDelegate {
        #[unsafe(method(windowShouldClose:))]
        fn window_should_close(&self, _sender: &NSWindow) -> bool {
            (self.ivars())()
        }
    }
);

impl WindowDelegate {
    fn new(mtm: MainThreadMarker, should_close: Box<dyn Fn() -> bool>) -> Retained<Self> {
        let this = Self::alloc(mtm).set_ivars(should_close);
        unsafe { msg_send![super(this), init] }
    }
}
