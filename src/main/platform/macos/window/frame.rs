// Where a page's window is and how large, in AppKit's screen coordinates,
// whose origin is the bottom left of the main screen.

use objc2::MainThreadMarker;
use objc2_app_kit::{NSEvent, NSScreen};
use objc2_foundation::{NSIntersectsRect, NSPoint, NSPointInRect, NSRect, NSSize};
use wren::RequestedBounds;

use super::PageWindow;

impl PageWindow {
    // AppKit keeps the window on a screen.
    pub fn cascade_from(&self, other: &PageWindow) {
        if let Some(frame) = other.cascaded(other.window.frame().size) {
            self.window.setFrame_display(frame, false);
        }
    }

    pub fn place_as_asked(
        &self,
        size: (f64, f64),
        origin: Option<(f64, f64)>,
        near: Option<&PageWindow>,
    ) {
        let window = &self.window;
        let size = self.set_content_size(size);
        let asked = origin
            .map(|(x, y)| NSRect::new(NSPoint::new(x, y), size))
            .filter(|&frame| is_on_screen(frame));
        match asked.or_else(|| near?.cascaded(size)) {
            Some(frame) => window.setFrame_display(frame, false),
            None => window.center(),
        }
    }

    pub fn place_at_pointer(&self, size: (f64, f64), margin: f64) {
        let size = self.set_content_size(size);
        let pointer = NSEvent::mouseLocation();
        let mtm = MainThreadMarker::new().unwrap();
        let screens = NSScreen::screens(mtm);
        let screen = screens
            .iter()
            .find(|screen| NSPointInRect(pointer, screen.frame()))
            .or_else(|| NSScreen::mainScreen(mtm));
        let Some(screen) = screen else {
            return self.window.center();
        };
        let origin = NSPoint::new(pointer.x - size.width / 2.0, pointer.y - size.height / 2.0);
        let frame = kept_inside(NSRect::new(origin, size), &screen, margin);
        self.window.setFrame_display(frame, false);
    }

    pub fn resize_from_top(&self, size: (f64, f64), margin: f64) {
        let old = self.window.frame();
        let size = self.frame_size(size);
        let origin = NSPoint::new(
            old.origin.x + (old.size.width - size.width) / 2.0,
            old.origin.y + old.size.height - size.height,
        );
        let mut frame = NSRect::new(origin, size);
        let mtm = MainThreadMarker::new().unwrap();
        if let Some(screen) = self.window.screen().or_else(|| NSScreen::mainScreen(mtm)) {
            frame = kept_inside(frame, &screen, margin);
        }
        self.window.setFrame_display(frame, true);
    }

    // Gives the window a content area of `size`, or its minimum, and
    // answers its frame's size.
    fn set_content_size(&self, size: (f64, f64)) -> NSSize {
        let size = NSSize::new(size.0, size.1);
        self.window
            .setContentSize(at_least(size, self.window.contentMinSize()));
        self.window.frame().size
    }

    // The size of the window's frame round a content area of `size`, or
    // its minimum.
    fn frame_size(&self, size: (f64, f64)) -> NSSize {
        let content = at_least(NSSize::new(size.0, size.1), self.window.contentMinSize());
        let rect = NSRect::new(NSPoint::new(0.0, 0.0), content);
        self.window.frameRectForContentRect(rect).size
    }

    // The frame of a window of `size` cascaded from this one, as AppKit
    // cascades windows: its top left just below and right of this one's.
    // None in full screen, which has no place to cascade from.
    fn cascaded(&self, size: NSSize) -> Option<NSRect> {
        const STEP: f64 = 26.0;
        if self.is_full_screen() {
            return None;
        }
        let frame = self.window.frame();
        let top = frame.origin.y + frame.size.height - STEP;
        let origin = NSPoint::new(frame.origin.x + STEP, top - size.height);
        Some(NSRect::new(origin, size))
    }

    // AppKit moves the window back onto a screen if that one has gone.
    pub fn restore_frame(&self, bounds: RequestedBounds) {
        let size = NSSize::new(bounds.width, bounds.height);
        let size = at_least(size, self.window.minSize());
        let origin = match bounds.origin {
            Some((x, y)) => NSPoint::new(x, y),
            None => self.window.frame().origin,
        };
        let frame = NSRect::new(origin, size);
        let frame = self
            .window
            .constrainFrameRect_toScreen(frame, self.window.screen().as_deref());
        self.window.setFrame_display(frame, false);
    }

    pub fn frame(&self) -> Option<RequestedBounds> {
        if self.is_full_screen() {
            return None;
        }
        let frame = self.window.frame();
        Some(RequestedBounds {
            origin: Some((frame.origin.x, frame.origin.y)),
            width: frame.size.width,
            height: frame.size.height,
        })
    }
}

// AppKit keeps the user from resizing a window below its minimum, but not
// the app.
fn at_least(size: NSSize, min: NSSize) -> NSSize {
    NSSize::new(size.width.max(min.width), size.height.max(min.height))
}

// `frame`, moved as little as keeps it `margin` points inside `screen`'s
// usable area on each side. Each limit applies in turn, the left and the
// top last, so a frame larger than the room keeps its left edge and its top
// on the screen.
fn kept_inside(frame: NSRect, screen: &NSScreen, margin: f64) -> NSRect {
    let area = screen.visibleFrame();
    let size = frame.size;
    let left = area.origin.x + margin;
    let right = area.origin.x + area.size.width - margin;
    let bottom = area.origin.y + margin;
    let top = area.origin.y + area.size.height - margin;
    let x = frame.origin.x.min(right - size.width).max(left);
    let y = frame.origin.y.max(bottom).min(top - size.height);
    NSRect::new(NSPoint::new(x, y), size)
}

// Whether a screen shows some of `frame`.
fn is_on_screen(frame: NSRect) -> bool {
    NSScreen::screens(MainThreadMarker::new().unwrap())
        .iter()
        .any(|screen| NSIntersectsRect(screen.visibleFrame(), frame))
}
