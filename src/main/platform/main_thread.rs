// Running on the main thread after a time. From another thread, Wren's
// `post_to_main_thread` does it.

use std::time::Duration;

use super::current;

/// Runs `f` on the main thread once `delay` has passed.
pub fn after(delay: Duration, f: impl FnOnce() + 'static) {
    current::main_thread::after(delay, f)
}
