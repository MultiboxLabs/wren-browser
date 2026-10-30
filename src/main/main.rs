mod analytics;
mod app;
mod changes;
mod channel;
mod db;
mod downloads;
mod extensions;
mod ipc;
mod menus;
mod pages;
mod perf;
mod pins;
mod platform;
mod shell;
mod sidebar;
mod tabs;
mod windows;

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
    let data = platform::data_dir().join(folder);
    analytics::catch_panics(data.clone(), channel, perf.is_some());
    let mut startup = Startup::new(data.to_string_lossy(), Keychain::Mock);
    channel.brand(&mut startup);
    startup.schemes = vec![Scheme::new(
        SCHEME,
        SchemePrivileges::STANDARD | SchemePrivileges::SECURE | SchemePrivileges::FETCH,
    )];
    let source = Source::from_env();
    startup.development_switches = source.development_switches();
    extensions::components::ship(&mut startup);
    // Not in a performance run, which measures the app alone.
    if perf.is_none() {
        extensions::ad_block::ship(&mut startup);
    }
    let state = Rc::new(State::new(data, channel, perf));
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
