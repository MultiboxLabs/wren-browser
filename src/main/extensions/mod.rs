// The extensions the app ships, each in a file that is the only one to know
// it: the ad blocker, which the user may turn off, and Wren Components,
// which they never see. The extensions' own files are in the repository's
// extensions/ folder (`wren-app.json` bundles them).

pub mod ad_block;
pub mod components;
