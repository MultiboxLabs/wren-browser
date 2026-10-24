// The keys the tab switcher answers (ipc/tab_switcher.rs), read from the
// app's keyboard events before a page, Chromium or the menu sees them: ⌃Tab
// is Chrome's Select Next Tab otherwise, and a page that has the keyboard
// hears Control's release where the app would not. The switcher's one
// place in AppKit; another platform gives the same `Key`s from its own
// events.

use std::ptr::NonNull;

use block2::RcBlock;
use objc2::rc::Retained;
use objc2::runtime::AnyObject;
use objc2_app_kit::{NSEvent, NSEventMask, NSEventModifierFlags, NSEventType};

// AppKit's key codes, which name the key whatever the layout.
const TAB: u16 = 48;
const ESCAPE: u16 = 53;

/// A key the tab switcher may take.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Key {
    /// ⌃Tab, or ⌃⇧Tab: `back`. Held, it repeats.
    ControlTab {
        back: bool,
    },
    /// Control is no longer held.
    ControlUp,
    Escape,
}

/// Watches the app's keyboard events for as long as it is kept.
pub struct KeyWatch(Retained<AnyObject>);

impl KeyWatch {
    /// `take` hears each `Key`, and answers whether it took it: a key it
    /// takes goes no further. Control's release always goes on, as it
    /// would have.
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
