// macOS's side of platform/keyboard.rs: a local monitor of AppKit's events,
// which sees them before any view does.

use std::ptr::NonNull;

use block2::RcBlock;
use objc2::rc::Retained;
use objc2::runtime::AnyObject;
use objc2_app_kit::{NSEvent, NSEventMask, NSEventModifierFlags, NSEventType};

use crate::platform::Key;

// AppKit's key codes, which name the key whatever the layout.
const TAB: u16 = 48;
const ESCAPE: u16 = 53;

pub struct KeyWatch(Retained<AnyObject>);

impl KeyWatch {
    pub fn new(take: impl Fn(Key) -> bool + 'static) -> Option<KeyWatch> {
        let block = RcBlock::new(move |event: NonNull<NSEvent>| -> *mut NSEvent {
            match key(unsafe { event.as_ref() }) {
                Some(key) if take(key) && key != Key::ControlUp => std::ptr::null_mut(),
                _ => event.as_ptr(),
            }
        });
        let mask = NSEventMask::KeyDown | NSEventMask::FlagsChanged;
        let monitor =
            unsafe { NSEvent::addLocalMonitorForEventsMatchingMask_handler(mask, &block) }?;
        Some(KeyWatch(monitor))
    }
}

impl Drop for KeyWatch {
    fn drop(&mut self) {
        unsafe { NSEvent::removeMonitor(&self.0) };
    }
}

fn key(event: &NSEvent) -> Option<Key> {
    let flags = event.modifierFlags();
    let control = flags.contains(NSEventModifierFlags::Control);
    match event.r#type() {
        NSEventType::FlagsChanged => (!control).then_some(Key::ControlUp),
        NSEventType::KeyDown => match event.keyCode() {
            // Not with ⌘ or ⌥ as well, which are other shortcuts.
            TAB if control
                && !flags
                    .intersects(NSEventModifierFlags::Command | NSEventModifierFlags::Option) =>
            {
                Some(Key::ControlTab {
                    back: flags.contains(NSEventModifierFlags::Shift),
                })
            }
            ESCAPE => Some(Key::Escape),
            _ => None,
        },
        _ => None,
    }
}
