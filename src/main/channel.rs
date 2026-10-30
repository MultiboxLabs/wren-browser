// The release channel this build is: its data and its logo. Its name is Wren
// in every channel.
//
// Every channel is the same app (one name and bundle ID), so a person can
// move between them and update in place. Stable and Beta share a data folder;
// Dev keeps its own. The build script names the channel (WREN_CHANNEL, at
// compile time), and a build that is not told is Dev.

use wren::Startup;

#[derive(Clone, Copy)]
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

    /// The folder in the platform's folder for apps' data
    /// (`platform::data_dir`) that holds the app's data.
    pub fn data_folder(self) -> &'static str {
        match self {
            Channel::Stable | Channel::Beta => "Wren",
            Channel::Dev => "Wren Dev",
        }
    }

    fn logo(self) -> &'static [u8] {
        match self {
            Channel::Stable => include_bytes!("../../branding/stable.png"),
            Channel::Beta => include_bytes!("../../branding/beta.png"),
            Channel::Dev => include_bytes!("../../branding/dev.png"),
        }
    }

    /// Puts the app's name and logo in Chromium's own UI (Settings, About,
    /// dialogs) in place of "Chromium".
    pub fn brand(self, startup: &mut Startup) {
        startup.product_name = Some("Wren".into());
        startup.product_icon_png = Some(self.logo().to_vec());
        startup.product_icon_dark_png = Some(self.logo().to_vec());
        startup.product_icon_svg = Some(include_bytes!("../../branding/wren-light.svg").to_vec());
        startup.product_icon_dark_svg =
            Some(include_bytes!("../../branding/wren-dark.svg").to_vec());
        startup.company_name = Some("Multibox Labs".into());
        startup.copyright = Some("Copyright 2026 Multibox Labs. All rights reserved.".into());
        startup.help_url = Some("https://github.com/MultiboxLabs/wren-browser".into());
    }
}
