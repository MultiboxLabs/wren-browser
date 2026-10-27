// Bringing the user's things over from another browser, which onboarding
// offers first (onboarding.rs). For now the browsers installed are only
// found, for the user to choose from; nothing is imported yet.

use serde::Serialize;

use crate::pages::icons;
use crate::platform;

/// A browser the user may bring their things over from.
struct Source {
    id: &'static str,
    name: &'static str,
    /// Its app's ID on this platform: on macOS, its bundle identifier.
    app: &'static str,
    /// It keeps tabs in spaces, as Wren does: they come over as spaces, and
    /// the user has none to make.
    spaces: bool,
}

// By name, as the user looks for theirs.
const SOURCES: [Source; 11] = [
    source("arc", "Arc", "company.thebrowser.Browser", true),
    source("brave", "Brave", "com.brave.Browser", false),
    source("chrome", "Chrome", "com.google.Chrome", false),
    source("dia", "Dia", "company.thebrowser.dia", false),
    source("edge", "Edge", "com.microsoft.edgemac", false),
    source("firefox", "Firefox", "org.mozilla.firefox", false),
    source("helium", "Helium", "net.imput.helium", false),
    source("opera", "Opera", "com.operasoftware.Opera", false),
    source("safari", "Safari", "com.apple.Safari", false),
    source("vivaldi", "Vivaldi", "com.vivaldi.Vivaldi", false),
    source("zen", "Zen", "app.zen-browser.zen", true),
];

const fn source(id: &'static str, name: &'static str, app: &'static str, spaces: bool) -> Source {
    Source {
        id,
        name,
        app,
        spaces,
    }
}

/// An installed browser, as the page lists it.
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
            let png = platform::installed_app_icon(source.app, ICON_SIZE)?;
            Some(Installed {
                id: source.id,
                name: source.name,
                icon: icons::id(png),
                spaces: source.spaces,
            })
        })
        .collect()
}
