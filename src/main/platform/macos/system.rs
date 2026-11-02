// macOS's side of platform/system.rs.

use objc2_app_kit::NSWorkspace;
use objc2_foundation::{NSBundle, NSProcessInfo, NSString, NSURL, ns_string};

use crate::platform::Privacy;

pub const OS_NAME: &str = "macos";

pub fn os_version() -> String {
    let version = NSProcessInfo::processInfo().operatingSystemVersion();
    format!(
        "{}.{}.{}",
        version.majorVersion, version.minorVersion, version.patchVersion
    )
}

pub fn app_version() -> Option<String> {
    let version = NSBundle::mainBundle()
        .objectForInfoDictionaryKey(ns_string!("CFBundleShortVersionString"))?;
    Some(version.downcast::<NSString>().ok()?.to_string())
}

pub fn open_privacy_settings(what: Privacy) {
    let pane = match what {
        Privacy::FullDiskAccess => {
            "x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles"
        }
    };
    if let Some(url) = NSURL::URLWithString(&NSString::from_str(pane)) {
        NSWorkspace::sharedWorkspace().openURL(&url);
    }
}
