mod app;
mod dev_server;
mod ipc;
mod main_window;
mod menus;
mod pages;
mod sidebar;
mod tabs;
mod window;

use std::rc::Rc;

use wren::{ExitStatus, Keychain, Scheme, SchemePrivileges, Startup};

use crate::app::{State, Wren};
use crate::pages::{SCHEME, Source};

fn main() {
    let data = format!(
        "{}/Library/Application Support/dev.multibox.wren",
        std::env::var("HOME").unwrap()
    );
    let mut startup = Startup::new(data.clone(), Keychain::Mock);
    startup.schemes = vec![Scheme::new(
        SCHEME,
        SchemePrivileges::STANDARD | SchemePrivileges::SECURE | SchemePrivileges::FETCH,
    )];
    let source = Source::from_env();
    startup.development_switches = source.development_switches();
    let state = Rc::new(State::new(data.into()));
    let status = wren::run(
        startup,
        Wren {
            state: state.clone(),
            source,
        },
    );
    // Drops the pages and their windows before the process ends.
    drop(state);
    std::process::exit(if status == ExitStatus::Normal {
        0
    } else {
        status as i32
    });
}
