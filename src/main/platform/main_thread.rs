// Running on the main thread later: after a time, or from another thread.

use std::time::Duration;

use super::current;

/// Runs `f` on the main thread once `delay` has passed.
pub fn after(delay: Duration, f: impl FnOnce() + 'static) {
    current::main_thread::after(delay, f)
}

/// Runs `f` on the main thread, from any thread, once the main thread is
/// free. Only the dev server needs it yet, which release builds leave out.
#[cfg(debug_assertions)]
pub fn on_main_thread(f: impl FnOnce() + Send + 'static) {
    current::main_thread::on_main_thread(f)
}
