// macOS's side of platform/secrets.rs. A Chromium-based browser keeps a
// password in the Keychain ("Chrome Safe Storage"), and encrypts each value
// with a key made from it: PBKDF2 with HMAC-SHA1, salt "saltysalt", 1003
// rounds, 16 bytes; then AES-128-CBC, its IV sixteen spaces, after a "v10".
// The Keychain is the Security framework's, and the rest CommonCrypto's, in
// libSystem: no crate, as only these few calls are needed.

use std::ffi::c_void;
use std::path::Path;

#[derive(Clone)]
pub struct Key([u8; 16]);

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

unsafe extern "C" {
    fn CCKeyDerivationPBKDF(
        algorithm: u32,
        password: *const u8,
        password_len: usize,
        salt: *const u8,
        salt_len: usize,
        prf: u32,
        rounds: u32,
        derived: *mut u8,
        derived_len: usize,
    ) -> i32;
    fn CCCrypt(
        op: u32,
        algorithm: u32,
        options: u32,
        key: *const c_void,
        key_len: usize,
        iv: *const c_void,
        data_in: *const c_void,
        data_in_len: usize,
        data_out: *mut c_void,
        data_out_available: usize,
        data_out_moved: *mut usize,
    ) -> i32;
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

const K_CC_PBKDF2: u32 = 2;
const K_CC_PRF_HMAC_SHA1: u32 = 1;
const K_CC_DECRYPT: u32 = 1;
const K_CC_AES: u32 = 0;
const K_CC_PKCS7_PADDING: u32 = 1;

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
    let mut key = [0u8; 16];
    let status = unsafe {
        CCKeyDerivationPBKDF(
            K_CC_PBKDF2,
            password.as_ptr(),
            password.len(),
            SALT.as_ptr(),
            SALT.len(),
            K_CC_PRF_HMAC_SHA1,
            ROUNDS,
            key.as_mut_ptr(),
            key.len(),
        )
    };
    if status != 0 {
        return Err(format!("CommonCrypto could not make the key ({status})."));
    }
    Ok(Key(key))
}

pub fn decrypt(key: &Key, value: &[u8]) -> Option<Vec<u8>> {
    let sealed = value.strip_prefix(VERSION)?;
    let mut out = vec![0u8; sealed.len() + 16];
    let mut moved = 0usize;
    let status = unsafe {
        CCCrypt(
            K_CC_DECRYPT,
            K_CC_AES,
            K_CC_PKCS7_PADDING,
            key.0.as_ptr().cast(),
            key.0.len(),
            IV.as_ptr().cast(),
            sealed.as_ptr().cast(),
            sealed.len(),
            out.as_mut_ptr().cast(),
            out.len(),
            &mut moved,
        )
    };
    if status != 0 {
        return None;
    }
    out.truncate(moved);
    Some(out)
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
        let mut sealed = vec![0u8; plain.len() + 16];
        let mut moved = 0usize;
        let status = unsafe {
            CCCrypt(
                0,
                K_CC_AES,
                K_CC_PKCS7_PADDING,
                key.0.as_ptr().cast(),
                key.0.len(),
                IV.as_ptr().cast(),
                plain.as_ptr().cast(),
                plain.len(),
                sealed.as_mut_ptr().cast(),
                sealed.len(),
                &mut moved,
            )
        };
        assert_eq!(status, 0);
        sealed.truncate(moved);
        let mut value = VERSION.to_vec();
        value.extend(sealed);
        assert_eq!(decrypt(&key, &value).as_deref(), Some(&plain[..]));
        assert_eq!(decrypt(&key, b"v11whatever"), None);
    }
}
