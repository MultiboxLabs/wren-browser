// Waiting on the main thread, without blocking it.

use std::time::Duration;

use super::current;

/// Runs `f` on the main thread once `delay` has passed.
pub fn after(delay: Duration, f: impl FnOnce() + 'static) {
    current::timer::after(delay, f)
}
