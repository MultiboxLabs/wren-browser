// The release channel this build is: its data and its logo. Its name is Wren
// in every channel.
//
// Every channel is the same app (one name and bundle ID), so a person can
// move between them and update in place. Stable and Beta share a data folder;
// Dev keeps its own. The build script names the channel (WREN_CHANNEL, at
// compile time), and a build that is not told is Dev.

use serde::Serialize;
use wren::{Keychain, Startup};

use crate::platform;

/// The name of the key's Keychain item, "Wren Safe Storage". Never change
/// it: a new name is a new key, and the cookies and passwords already saved
/// could no longer be read.
pub const KEYCHAIN_NAME: &str = "Wren";

#[derive(Clone, Copy, Debug, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Channel {
    Stable,
    Beta,
    Dev,
}

impl Channel {
    pub fn current() -> Channel {
        match option_env!("WREN_CHANNEL") {
            Some("stable") => Channel::Stable,
            Some("beta") => Channel::Beta,
            _ => Channel::Dev,
        }
    }

    /// Its name, as analytics reports it.
    pub fn name(self) -> &'static str {
        match self {
            Channel::Stable => "stable",
            Channel::Beta => "beta",
            Channel::Dev => "dev",
        }
    }

    /// Chrome's channel of the same name, which Chromium reports, so an
    /// extension gets the APIs it would on that channel of Chrome.
    pub fn chromium(self) -> wren::Channel {
        match self {
            Channel::Stable => wren::Channel::Stable,
            Channel::Beta => wren::Channel::Beta,
            Channel::Dev => wren::Channel::Dev,
        }
    }

    /// The folder in the platform's folder for apps' data
    /// (`platform::data_dir`) that holds the app's data.
    pub fn data_folder(self) -> &'static str {
        match self {
            Channel::Stable | Channel::Beta => "Wren",
            Channel::Dev => "Wren Dev",
        }
    }

    /// Where Chromium keeps the key it encrypts cookies and passwords with.
    /// It follows the data folder, as what one key wrote the other cannot
    /// read: Stable and Beta keep theirs in the login Keychain (under
    /// `KEYCHAIN_NAME`); Dev keeps a fixed one in memory, as macOS asks an
    /// ad hoc build for the Keychain again after every rebuild.
    pub fn keychain(self) -> Keychain {
        match self {
            Channel::Stable | Channel::Beta => Keychain::System,
            Channel::Dev => Keychain::Mock,
        }
    }

    fn logo(self) -> &'static [u8] {
        match self {
            Channel::Stable => include_bytes!("../../branding/stable.png"),
            Channel::Beta => include_bytes!("../../branding/beta.png"),
            Channel::Dev => include_bytes!("../../branding/dev.png"),
        }
    }

    /// Puts the app's name, logo and version in Chromium's own UI (Settings,
    /// About, dialogs) in place of Chromium's.
    pub fn brand(self, startup: &mut Startup) {
        startup.product_name = Some("Wren".into());
        startup.product_icon_png = Some(self.logo().to_vec());
        startup.product_icon_dark_png = Some(self.logo().to_vec());
        startup.product_icon_svg = Some(include_bytes!("../../branding/wren-light.svg").to_vec());
        startup.product_icon_dark_svg =
            Some(include_bytes!("../../branding/wren-dark.svg").to_vec());
        startup.company_name = Some("Multibox Labs".into());
        startup.copyright = Some("Copyright © 2026 Multibox Labs.".into());
        startup.help_url = Some("https://github.com/MultiboxLabs/wren-browser".into());
        // The bundle's, from the manifest's `version`.
        startup.app_version = platform::app_version();
    }
}
