// macOS's side of platform/system.rs.

use objc2_foundation::NSProcessInfo;

pub const OS_NAME: &str = "macos";

pub fn os_version() -> String {
    let version = NSProcessInfo::processInfo().operatingSystemVersion();
    format!(
        "{}.{}.{}",
        version.majorVersion, version.minorVersion, version.patchVersion
    )
}
