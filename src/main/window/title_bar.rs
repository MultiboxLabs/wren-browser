// The close, minimise and zoom buttons, which the page places in its own
// title bar, light or dark as the page is.

use std::cell::Cell;

use objc2::rc::Retained;
use objc2_app_kit::{NSAppearanceCustomization, NSButton, NSWindow, NSWindowButton};
use objc2_foundation::NSPoint;

// The window's buttons as the page wants them, and whether the window is
// full screen, where AppKit shows them in a title bar of its own instead.
// A window with the system's title bar (`TitleBarKind::System`) leaves
// them to AppKit always.
#[derive(Default)]
pub(super) struct TitleBar {
    // The system's title bar, not the page's.
    pub(super) system: bool,
    pub(super) full_screen: Cell<bool>,
    pub(super) buttons_at: Cell<Option<(f64, f64)>>,
    pub(super) buttons_hidden: Cell<bool>,
    // Whether the page around them is dark.
    pub(super) dark: Cell<bool>,
}

impl TitleBar {
    // Puts the buttons where the page wants them, drawn as the page is;
    // full screen, leaves them to AppKit, shown, in its title bar, which is
    // as the system is.
    pub(super) fn apply(&self, window: &NSWindow) {
        if self.system {
            return;
        }
        let full_screen = self.full_screen.get();
        let appearance = (!full_screen)
            .then(|| super::appearance(self.dark.get()))
            .flatten();
        for button in buttons(window).into_iter().flatten() {
            button.setHidden(!full_screen && self.buttons_hidden.get());
            button.setAppearance(appearance.as_deref());
        }
        if let (false, Some(at)) = (full_screen, self.buttons_at.get()) {
            place_buttons(window, at);
        }
    }
}

// The close, minimise and zoom buttons.
fn buttons(window: &NSWindow) -> [Option<Retained<NSButton>>; 3] {
    [
        NSWindowButton::CloseButton,
        NSWindowButton::MiniaturizeButton,
        NSWindowButton::ZoomButton,
    ]
    .map(|kind| window.standardWindowButton(kind))
}

fn place_buttons(window: &NSWindow, (x, y): (f64, f64)) {
    let [Some(close), Some(minimise), Some(zoom)] = buttons(window) else {
        return;
    };
    // Keeps AppKit's spacing between them.
    let spacing = minimise.frame().origin.x - close.frame().origin.x;
    let height = window.frame().size.height;
    for (index, button) in [close, minimise, zoom].iter().enumerate() {
        let Some(superview) = (unsafe { button.superview() }) else {
            continue;
        };
        let size = button.frame().size;
        let in_window = NSPoint::new(x + spacing * index as f64, height - y - size.height);
        button.setFrameOrigin(superview.convertPoint_fromView(in_window, None));
    }
}
