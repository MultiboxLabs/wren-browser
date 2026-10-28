// The keys the tab switcher answers (ipc/tab_switcher.rs), read from the
// app's keyboard events before a page, Chromium or the menu sees them: ⌃Tab
// is Chrome's Select Next Tab otherwise, and a page that has the keyboard
// hears Control's release where the app would not. Each platform gives the
// same `Key`s from its own events.

use super::current;

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
pub struct KeyWatch {
    // Kept for its drop, which stops the watch.
    _native: current::keyboard::KeyWatch,
}

impl KeyWatch {
    /// `take` hears each `Key`, and answers whether it took it: a key it
    /// takes goes no further. Control's release always goes on, as it
    /// would have.
    pub fn new(take: impl Fn(Key) -> bool + 'static) -> Option<KeyWatch> {
        current::keyboard::KeyWatch::new(take).map(|native| KeyWatch { _native: native })
    }
}
