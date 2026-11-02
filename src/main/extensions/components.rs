// Wren Components: an internal extension (a hidden component extension, which
// the user never sees on chrome://extensions or turns off) that holds the
// code Wren runs inside pages. Only this file knows the extension; its
// folder is extensions/wren-components, its parts one for each site (a
// script, or a folder: chrome-pages/ restyles Chromium's own pages, bridge/
// relays a page of Wren's own in a tab to the app, through the native host
// declared here).

use wren::{AppExtension, MainThread, NativeHost, Startup};

use super::bridge;
use crate::platform;

/// Its ID, which its manifest's `key` gives
/// (`wren extension-id extensions/wren-components`).
const ID: &str = "mcijlkakinfeajlmhefinkikfdbkfpfe";

/// The native host it relays pages to, which only it may reach; bridge/
/// worker.js names it too.
const HOST: &str = "dev.multibox.wren.components";

/// Lists it among the app's extensions, and declares its host. Its folder is
/// in the app's resources (`wren-app.json`).
pub fn ship(startup: &mut Startup) {
    let folder = platform::resources_dir().join("wren-components");
    startup
        .extensions
        .push(AppExtension::internal(folder.to_string_lossy()));
    startup
        .native_hosts
        .push(NativeHost::new(HOST, vec![ID.into()]));
}

/// Answers its host, once the app is ready.
pub fn ready(mt: MainThread) {
    if let Err(error) = mt.set_native_host_handler(HOST, Some(Box::new(bridge::serve))) {
        eprintln!("Wren could not answer Wren Components: {error:?}");
    }
}
