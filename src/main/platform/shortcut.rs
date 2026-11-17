// Shortcuts that work in any app, not only while Wren is in front, as ⌥⌘N
// opens a Mini Wren. Each platform takes the key from the system, so other
// apps no longer get it while it is kept.

use wren::MenuKey;

use super::current;

/// A shortcut that works in any app for as long as it is kept.
pub struct GlobalShortcut {
    // Kept for its drop, which gives the key back.
    _native: current::shortcut::GlobalShortcut,
}

impl GlobalShortcut {
    /// Takes `key`, a menu item's, from every app, and calls `on_press` each
    /// time it is pressed. The key is the one that types its letter in the
    /// current layout, as the main menu's is. Wren does not come forward by
    /// itself: what `on_press` shows brings it. None if `key` is not a
    /// letter, a to z, or another app has it.
    pub fn new(key: &MenuKey, on_press: impl Fn() + 'static) -> Option<GlobalShortcut> {
        current::shortcut::GlobalShortcut::new(key, on_press)
            .map(|native| GlobalShortcut { _native: native })
    }
}
