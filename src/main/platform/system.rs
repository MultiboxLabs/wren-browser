// What the app reports of the system it runs on.

use super::current;

/// The name of the platform, as analytics reports it.
pub const OS_NAME: &str = current::system::OS_NAME;

/// The version of the system, as `"26.1.0"`.
pub fn os_version() -> String {
    current::system::os_version()
}

/// The app's own version, as people see it (`"1.2.0"`): the manifest's
/// `version`.
pub fn app_version() -> Option<String> {
    current::system::app_version()
}

/// What the user may let the app do in the system's privacy settings.
pub enum Privacy {
    /// Read what other apps keep (Safari's, on macOS).
    FullDiskAccess,
}

/// Opens the system's settings where the user allows `what`.
pub fn open_privacy_settings(what: Privacy) {
    current::system::open_privacy_settings(what)
}
