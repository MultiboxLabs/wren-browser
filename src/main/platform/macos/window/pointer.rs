// Where the pointer is, as a window sees it, and its moves: a local monitor
// of the app's mouse events, which sees each one before any view does. AppKit
// gives the key window the moves beyond it too, as it accepts them. Only the
// window in use has a part in the pointer, so the monitor is there only
// while it is, and a window not in use costs nothing as the pointer moves.

use std::ptr::NonNull;
use std::rc::Rc;

use block2::RcBlock;
use objc2::MainThreadMarker;
use objc2::rc::Retained;
use objc2::runtime::AnyObject;
use objc2_app_kit::{NSEvent, NSEventMask, NSWindow};
use objc2_foundation::NSPoint;
use wren::MainThread;

use super::{PageWindow, is_active};

impl PageWindow {
    pub fn pointer(&self) -> Option<(f64, f64)> {
        let (x, y) = self.pointer_place()?;
        let size = self.window.contentView()?.bounds().size;
        ((0.0..=size.width).contains(&x) && (0.0..=size.height).contains(&y)).then_some((x, y))
    }

    pub fn pointer_place(&self) -> Option<(f64, f64)> {
        let content = self.window.contentView()?;
        let at =
            content.convertPoint_fromView(self.window.mouseLocationOutsideOfEventStream(), None);
        let y = match content.isFlipped() {
            true => at.y,
            false => content.bounds().size.height - at.y,
        };
        Some((at.x, y))
    }

    pub fn owns_pointer(&self) -> bool {
        if !is_active(&self.window) {
            return false;
        }
        let at = NSEvent::mouseLocation();
        let mtm = MainThreadMarker::new().unwrap();
        !frame_contains(&self.window, at)
            || NSWindow::windowNumberAtPoint_belowWindowWithWindowNumber(at, 0, mtm)
                == self.window.windowNumber()
    }

    // The monitor comes and goes with the window's use, and `moved` runs
    // as it does: the pointer became the window's, or stopped being so,
    // without moving.
    pub fn watch_pointer(&self, mt: MainThread, moved: impl Fn() + 'static) {
        self.window.setAcceptsMouseMovedEvents(true);
        let moved: Rc<dyn Fn()> = Rc::new(moved);
        let (window, monitor) = (self.window.clone(), self.pointer_monitor.clone());
        let follow = move || {
            let active = is_active(&window);
            let mut current = monitor.borrow_mut();
            if active && current.is_none() {
                *current = add_monitor(moved.clone());
            } else if !active && let Some(stopped) = current.take() {
                remove_monitor(&stopped);
            }
            drop(current);
            moved();
        };
        follow();
        self.after_focus_moves(mt, follow);
    }
}

// Runs `moved` on each of the app's pointer moves and drags, until the
// monitor is removed.
fn add_monitor(moved: Rc<dyn Fn()>) -> Option<Retained<AnyObject>> {
    let block = RcBlock::new(move |event: NonNull<NSEvent>| -> *mut NSEvent {
        moved();
        event.as_ptr()
    });
    let mask = NSEventMask::MouseMoved
        | NSEventMask::LeftMouseDragged
        | NSEventMask::RightMouseDragged
        | NSEventMask::OtherMouseDragged;
    unsafe { NSEvent::addLocalMonitorForEventsMatchingMask_handler(mask, &block) }
}

pub(super) fn remove_monitor(monitor: &AnyObject) {
    unsafe { NSEvent::removeMonitor(monitor) };
}

// Whether `at`, on the screen, is within the window's frame.
fn frame_contains(window: &NSWindow, at: NSPoint) -> bool {
    let frame = window.frame();
    (frame.origin.x..frame.origin.x + frame.size.width).contains(&at.x)
        && (frame.origin.y..frame.origin.y + frame.size.height).contains(&at.y)
}
