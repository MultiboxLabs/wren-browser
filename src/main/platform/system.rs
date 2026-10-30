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
