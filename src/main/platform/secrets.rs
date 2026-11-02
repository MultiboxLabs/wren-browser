// How another browser on this platform locks what it keeps on disk, for
// bringing it over (import/): the key a Chromium-based browser encrypts its
// cookies with, and decrypting with it. On macOS the key is a password in
// the user's Keychain, which macOS asks the user before handing over.

use std::path::Path;

use super::current;

/// A browser's key, as the platform opens it.
pub struct BrowserKey(current::secrets::Key);

/// The key a Chromium-based browser keeps its cookies under: on macOS, its
/// Keychain item `service` / `account` ("Chrome Safe Storage" / "Chrome").
/// `data_folder` is the browser's own, where another platform keeps it.
/// None if the user would not let Wren have it, or there is none.
pub fn chromium_key(
    service: &str,
    account: &str,
    data_folder: &Path,
) -> Result<Option<BrowserKey>, String> {
    Ok(current::secrets::chromium_key(service, account, data_folder)?.map(BrowserKey))
}

/// One value the browser encrypted, decrypted; None if this key does not
/// open it.
pub fn decrypt(key: &BrowserKey, value: &[u8]) -> Option<Vec<u8>> {
    current::secrets::decrypt(&key.0, value)
}
