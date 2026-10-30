// macOS's side of platform/system.rs.

use objc2_foundation::{NSBundle, NSProcessInfo, NSString, ns_string};

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
