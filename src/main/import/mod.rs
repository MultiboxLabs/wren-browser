// Bringing the user's things over from the browser they used before:
// wren://migrate (ipc/migrate.rs), and onboarding's list of the browsers
// installed (onboarding.rs). Each source is a browser built on an engine
// (source.rs, sources.rs); what it has is read on a thread of its own, and
// landed in Wren on the main thread, one run at a time (run.rs, land/).

mod browsers;
mod data;
mod engines;
mod favicons;
mod land;
pub mod run;
mod snapshot;
mod source;
mod sources;

use serde::Serialize;

use crate::pages::icons;
use crate::platform;
pub use source::{Source, SourceProfile, Survey};
use sources::SOURCES;

/// An installed browser, as onboarding lists it.
#[derive(Serialize)]
pub struct Installed {
    id: &'static str,
    name: &'static str,
    /// Its app's icon's ID (`iconUrl`).
    icon: String,
    spaces: bool,
}

/// The size its icon is listed at, in points.
const ICON_SIZE: f64 = 40.0;

/// The browsers installed, by name.
pub fn installed() -> Vec<Installed> {
    SOURCES
        .iter()
        .filter_map(|source| {
            let about = source.about();
            let png = platform::installed_app_icon(about.app, ICON_SIZE)?;
            Some(Installed {
                id: about.id,
                name: about.name,
                icon: icons::id(png),
                spaces: source.keeps_spaces(),
            })
        })
        .collect()
}

/// The source with `id`, if it is installed.
pub fn source(id: &str) -> Option<&'static dyn Source> {
    SOURCES.iter().copied().find(|source| {
        source.about().id == id && platform::installed_app_icon(source.about().app, 16.0).is_some()
    })
}

/// The size wren://migrate's sky shows a source's icon at, in points: its
/// body 84, in the margin around it (pages/migrate/source-icon.tsx).
const LARGE_ICON_SIZE: f64 = 112.0;

/// Every source installed, with its app's icon, large enough for the sky.
pub fn installed_sources() -> Vec<(&'static dyn Source, Vec<u8>)> {
    SOURCES
        .iter()
        .filter_map(|source| {
            Some((
                *source,
                platform::installed_app_icon(source.about().app, LARGE_ICON_SIZE)?,
            ))
        })
        .collect()
}
