// Reading a property list (Apple's settings and data files, such as
// Safari's bookmarks), as JSON: what bringing Safari's things over reads
// (import/engines/safari). Dates are milliseconds since 1970; data is left
// out. Another platform has none to read.

use std::path::Path;

use super::current;

/// The property list at `path`, as JSON. A file the system keeps from Wren
/// fails as `PermissionDenied`, and one that is no property list as
/// `InvalidData`.
pub fn read_property_list(path: &Path) -> std::io::Result<serde_json::Value> {
    let bytes = std::fs::read(path)?;
    current::property_list::parse(&bytes)
        .ok_or_else(|| std::io::Error::new(std::io::ErrorKind::InvalidData, "not a property list"))
}
