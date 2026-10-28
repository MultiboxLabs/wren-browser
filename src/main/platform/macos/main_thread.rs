// macOS's side of platform/main_thread.rs: the main dispatch queue.

use std::cell::{Cell, RefCell};
use std::collections::HashMap;
use std::time::Duration;

use dispatch2::{DispatchQueue, DispatchTime};

thread_local! {
    // What waits for a time, by ID: it stays on the main thread, and only
    // its ID goes to the queue.
    static TIMERS: RefCell<HashMap<u64, Box<dyn FnOnce()>>> = RefCell::default();
    static NEXT_ID: Cell<u64> = const { Cell::new(0) };
}

pub fn after(delay: Duration, f: impl FnOnce() + 'static) {
    let id = NEXT_ID.with(|next| next.replace(next.get() + 1));
    TIMERS.with_borrow_mut(|timers| timers.insert(id, Box::new(f)));
    // One too far off to say never comes.
    let when = DispatchTime::try_from(delay).unwrap_or(DispatchTime::FOREVER);
    let _ = DispatchQueue::main().after(when, move || {
        if let Some(f) = TIMERS.with_borrow_mut(|timers| timers.remove(&id)) {
            f();
        }
    });
}

pub fn on_main_thread(f: impl FnOnce() + Send + 'static) {
    DispatchQueue::main().exec_async(f);
}
