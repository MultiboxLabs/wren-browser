// The extensions the app ships, each in a file that is the only one to know
// it: the ad blocker, which the user may turn off, and Wren Components,
// which they never see. The extensions' own files are in the repository's
// extensions/ folder (`wren-app.json` bundles them). bridge.rs answers the
// pages Wren Components relays to the app.

pub mod ad_block;
pub mod bridge;
pub mod components;

use wren::{ProfileExtensionsRequest, ProfileKind};

use crate::app::State;

/// Which of the app's extensions a profile gets, for
/// `App::profile_extensions`: the ad blocker and Wren Components, in every
/// profile but the pages', the one ephemeral profile. The ad blocker starts
/// on in a new profile as the setting says. Chromium waits for the answer,
/// and allows no call of Wren Runtime's here.
pub fn for_profile(state: &State, request: &mut ProfileExtensionsRequest) {
    let gets = request.kind != ProfileKind::Ephemeral;
    for extension in &mut request.extensions {
        extension.gets = gets;
    }
    let settings = state.db.settings();
    let block_ads = settings.map_or(true, |settings| settings.block_ads_in_new_profiles);
    ad_block::on_install(request, block_ads);
}
