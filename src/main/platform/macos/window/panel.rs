// The window of `WindowKind::Panel`: an NSPanel with the non-activating
// style, the one kind of window AppKit lets take the keyboard while its app
// stays in the background. Its other panel ways are undone, so in all else
// it is a window like any other: it can be the main window, it stays on
// screen while the app is in the background, it is in the Window menu, and
// Escape is its page's alone.

use objc2::rc::Retained;
use objc2::runtime::{AnyObject, NSObject};
use objc2::{MainThreadMarker, MainThreadOnly, define_class, msg_send};
use objc2_app_kit::{NSBackingStoreType, NSPanel, NSResponder, NSWindow, NSWindowStyleMask};
use objc2_foundation::NSRect;

define_class!(
    #[unsafe(super(NSPanel, NSWindow, NSResponder, NSObject))]
    #[thread_kind = MainThreadOnly]
    #[name = "WrenPanel"]
    struct Panel;

    impl Panel {
        // A panel is never the main window; this one can be, as a window
        // can.
        #[unsafe(method(canBecomeMainWindow))]
        fn can_become_main_window(&self) -> bool {
            true
        }

        // A panel closes as Escape reaches it; a window does nothing.
        #[unsafe(method(cancelOperation:))]
        fn cancel_operation(&self, _sender: Option<&AnyObject>) {}
    }
);

/// A panel with `frame` as its content and `style`, which takes the
/// keyboard without bringing the app forward.
pub(super) fn open(
    mtm: MainThreadMarker,
    frame: NSRect,
    style: NSWindowStyleMask,
) -> Retained<NSWindow> {
    let style = style | NSWindowStyleMask::NonactivatingPanel;
    let panel: Retained<Panel> = unsafe {
        msg_send![
            Panel::alloc(mtm),
            initWithContentRect: frame,
            styleMask: style,
            backing: NSBackingStoreType::Buffered,
            defer: false,
        ]
    };
    let window = Retained::into_super(Retained::into_super(panel));
    window.setHidesOnDeactivate(false);
    window.setExcludedFromWindowsMenu(false);
    window
}
