// Bringing the user's things over from the browser they used before, on
// wren://migrate and in onboarding (ipc/migrate.rs). Each source is a
// browser built on an engine (source.rs, sources.rs); the pages list what
// it has (listing.rs), read on a thread of its own, and it is landed in
// Wren on the main thread, one run at a time (run.rs, land/).

mod browsers;
mod data;
mod engines;
mod favicons;
mod land;
pub mod listing;
pub mod run;
mod snapshot;
mod source;
mod sources;

use crate::platform;
pub use data::SpaceCount;
pub use land::extensions::retry as pin_waiting_extensions;
pub use land::profiles::Landing;
pub use source::{ReadError, Source, SourceProfile, Survey};
use sources::SOURCES;

/// The source with `id`, if it is installed.
pub fn source(id: &str) -> Option<&'static dyn Source> {
    SOURCES
        .iter()
        .copied()
        .find(|source| source.about().id == id && platform::is_app_installed(source.about().app))
}

/// Every source installed, by name, with its app's icon at `size` points.
pub fn installed_sources(size: f64) -> Vec<(&'static dyn Source, Vec<u8>)> {
    SOURCES
        .iter()
        .filter_map(|source| {
            Some((
                *source,
                platform::installed_app_icon(source.about().app, size)?,
            ))
        })
        .collect()
}
