mod app;
mod pages;
mod window;

use std::rc::Rc;

use wren::{ExitStatus, Keychain, Scheme, SchemePrivileges, Startup};

use crate::app::{State, Wren};
use crate::pages::schemes;

fn main() {
    let data = format!(
        "{}/Library/Application Support/dev.multibox.wren",
        std::env::var("HOME").unwrap()
    );
    let mut startup = Startup::new(data, Keychain::Mock);
    startup.schemes = schemes()
        .into_iter()
        .map(|scheme| {
            Scheme::new(
                scheme,
                SchemePrivileges::STANDARD | SchemePrivileges::SECURE | SchemePrivileges::FETCH,
            )
        })
        .collect();
    let state = Rc::new(State::default());
    let status = wren::run(startup, Wren(state.clone()));
    // Drops the pages and their windows before the process ends.
    drop(state);
    std::process::exit(if status == ExitStatus::Normal {
        0
    } else {
        status as i32
    });
}
