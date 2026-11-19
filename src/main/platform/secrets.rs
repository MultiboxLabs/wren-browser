// How another browser on this platform locks what it keeps on disk, for
// bringing it over (import/): the key a Chromium-based browser encrypts its
// cookies with, and decrypting with it. A browser that locks more with the
// key, as Dia does its databases, makes its own keys from its bytes, with
// the ciphers in crypto.rs. On macOS the key is a password in the user's
// Keychain, which macOS asks the user before handing over. A key the user
// gave is kept while Wren runs, so they are asked once, not for each of the
// browser's profiles.

use std::collections::HashMap;
use std::path::Path;
use std::sync::{LazyLock, Mutex};

use super::current;

/// A browser's key, as the platform opens it.
#[derive(Clone)]
pub struct BrowserKey(current::secrets::Key);

impl BrowserKey {
    /// The key itself, as Chromium keeps it in memory (OSCrypt's), which a
    /// browser built on it may derive other keys from.
    pub fn bytes(&self) -> &[u8] {
        self.0.bytes()
    }
}

/// The keys given, by their item's service and account.
static GIVEN: LazyLock<Mutex<HashMap<(String, String), BrowserKey>>> =
    LazyLock::new(Mutex::default);

/// The key a Chromium-based browser keeps its cookies under: on macOS, its
/// Keychain item `service` / `account` ("Chrome Safe Storage" / "Chrome").
/// `data_folder` is the browser's own, where another platform keeps it.
/// None if the user would not let Wren have it, or there is none.
pub fn chromium_key(
    service: &str,
    account: &str,
    data_folder: &Path,
) -> Result<Option<BrowserKey>, String> {
    let item = (service.to_owned(), account.to_owned());
    // Held while macOS asks, so that two reads ask once between them.
    let mut given = GIVEN
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    if let Some(key) = given.get(&item) {
        return Ok(Some(key.clone()));
    }
    let key = current::secrets::chromium_key(service, account, data_folder)?.map(BrowserKey);
    if let Some(key) = &key {
        given.insert(item, key.clone());
    }
    Ok(key)
}

/// One value the browser encrypted, decrypted; None if this key does not
/// open it.
pub fn decrypt(key: &BrowserKey, value: &[u8]) -> Option<Vec<u8>> {
    current::secrets::decrypt(&key.0, value)
}
