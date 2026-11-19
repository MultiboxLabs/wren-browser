// macOS's side of platform/secrets.rs. A Chromium-based browser keeps a
// password in the Keychain ("Chrome Safe Storage"), and encrypts each value
// with a key made from it: PBKDF2 with HMAC-SHA1, salt "saltysalt", 1003
// rounds, 16 bytes; then AES-128-CBC, its IV sixteen spaces, after a "v10".
// The Keychain is the Security framework's, and the ciphers CommonCrypto's
// (crypto.rs).

use std::ffi::c_void;
use std::path::Path;

use super::crypto;
use crate::platform::Hash;

#[derive(Clone)]
pub struct Key([u8; 16]);

impl Key {
    pub fn bytes(&self) -> &[u8] {
        &self.0
    }
}

#[link(name = "Security", kind = "framework")]
unsafe extern "C" {
    // Deprecated for `SecItemCopyMatching`, but what Chromium still reads
    // its own key with.
    fn SecKeychainFindGenericPassword(
        keychains: *const c_void,
        service_length: u32,
        service: *const std::ffi::c_char,
        account_length: u32,
        account: *const std::ffi::c_char,
        password_length: *mut u32,
        password: *mut *mut c_void,
        item: *mut *mut c_void,
    ) -> i32;
    fn SecKeychainItemFreeContent(attributes: *const c_void, data: *mut c_void) -> i32;
}

const ERR_SEC_ITEM_NOT_FOUND: i32 = -25300;
const ERR_SEC_USER_CANCELED: i32 = -128;
const ERR_SEC_AUTH_FAILED: i32 = -25293;
const ERR_SEC_INTERACTION_NOT_ALLOWED: i32 = -25308;

/// How Chromium makes its key from the Keychain's password, on macOS.
const SALT: &[u8] = b"saltysalt";
const ROUNDS: u32 = 1003;
/// What a value it encrypted starts with, before its ciphertext.
const VERSION: &[u8] = b"v10";
const IV: [u8; 16] = [b' '; 16];

pub fn chromium_key(
    service: &str,
    account: &str,
    _data_folder: &Path,
) -> Result<Option<Key>, String> {
    let Some(password) = keychain_password(service, account)? else {
        return Ok(None);
    };
    derive(&password).map(Some)
}

// The key Chromium makes from `password`.
fn derive(password: &[u8]) -> Result<Key, String> {
    crypto::pbkdf2(Hash::Sha1, password, SALT, ROUNDS, 16)
        .and_then(|key| key.try_into().ok())
        .map(Key)
        .ok_or_else(|| "CommonCrypto could not make the key.".into())
}

pub fn decrypt(key: &Key, value: &[u8]) -> Option<Vec<u8>> {
    crypto::decrypt_aes_cbc(&key.0, &IV, value.strip_prefix(VERSION)?, true)
}

// The password of the Keychain's generic password item `service` /
// `account`, which macOS asks the user to let Wren read. None if there is no
// such item, or the user said no. It is read as Chromium reads its own:
// `SecItemCopyMatching` had macOS ask twice for one item.
fn keychain_password(service: &str, account: &str) -> Result<Option<Vec<u8>>, String> {
    let length = |text: &str| u32::try_from(text.len()).map_err(|_| "The name is too long.");
    let mut password_length = 0u32;
    let mut password: *mut c_void = std::ptr::null_mut();
    let status = unsafe {
        SecKeychainFindGenericPassword(
            std::ptr::null(),
            length(service)?,
            service.as_ptr().cast(),
            length(account)?,
            account.as_ptr().cast(),
            &mut password_length,
            &mut password,
            std::ptr::null_mut(),
        )
    };
    match status {
        0 => {
            let bytes = unsafe {
                std::slice::from_raw_parts(password.cast::<u8>(), password_length as usize)
            }
            .to_vec();
            unsafe { SecKeychainItemFreeContent(std::ptr::null(), password) };
            Ok(Some(bytes))
        }
        ERR_SEC_ITEM_NOT_FOUND
        | ERR_SEC_USER_CANCELED
        | ERR_SEC_AUTH_FAILED
        | ERR_SEC_INTERACTION_NOT_ALLOWED => Ok(None),
        status => Err(format!("The Keychain refused ({status}).")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // A value encrypted as Chromium does (CommonCrypto, with a key made
    // from a password as Chromium makes it) decrypts; one of another
    // version does not.
    #[test]
    fn decrypts_what_chromium_encrypts() {
        let key = derive(b"peanuts").unwrap();
        let plain = b"a cookie's value";
        let sealed = crypto::encrypt_aes_cbc(&key.0, &IV, plain, true).unwrap();
        let mut value = VERSION.to_vec();
        value.extend(sealed);
        assert_eq!(decrypt(&key, &value).as_deref(), Some(&plain[..]));
        assert_eq!(decrypt(&key, b"v11whatever"), None);
    }
}
