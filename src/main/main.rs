mod ad_block;
mod app;
mod changes;
mod channel;
mod db;
mod ipc;
mod keyboard;
mod menus;
mod pages;
mod perf;
mod sidebar;
mod spaces;
mod tabs;
mod window;

use std::rc::Rc;

use wren::{ExitStatus, Keychain, Scheme, SchemePrivileges, Startup};

use crate::app::{State, Wren};
use crate::channel::Channel;
use crate::pages::{SCHEME, Source};
use crate::perf::Perf;

fn main() {
    let channel = Channel::current();
    let perf = Perf::from_env(channel);
    let folder = match perf {
        Some(_) => Perf::DATA_FOLDER,
        None => channel.data_folder(),
    };
    let data = format!(
        "{}/Library/Application Support/{folder}",
        std::env::var("HOME").unwrap()
    );
    let mut startup = Startup::new(data.clone(), Keychain::Mock);
    channel.brand(&mut startup);
    startup.schemes = vec![Scheme::new(
        SCHEME,
        SchemePrivileges::STANDARD | SchemePrivileges::SECURE | SchemePrivileges::FETCH,
    )];
    let source = Source::from_env();
    startup.development_switches = source.development_switches();
    // Not in a performance run, which measures the app alone.
    if perf.is_none() {
        ad_block::ship(&mut startup);
    }
    let state = Rc::new(State::new(data.into(), perf));
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
