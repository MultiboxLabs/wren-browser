// macOS's side of platform/secrets.rs. A Chromium-based browser keeps a
// password in the Keychain ("Chrome Safe Storage"), and encrypts each value
// with a key made from it: PBKDF2 with HMAC-SHA1, salt "saltysalt", 1003
// rounds, 16 bytes; then AES-128-CBC, its IV sixteen spaces, after a "v10".
// The Keychain is the Security framework's, and the rest CommonCrypto's, in
// libSystem: no crate, as only these few calls are needed.

use std::ffi::c_void;
use std::path::Path;

use objc2::rc::Retained;
use objc2::runtime::AnyObject;
use objc2_foundation::{NSData, NSDictionary, NSNumber, NSString};

#[derive(Clone)]
pub struct Key([u8; 16]);

#[link(name = "Security", kind = "framework")]
unsafe extern "C" {
    static kSecClass: *const NSString;
    static kSecClassGenericPassword: *const NSString;
    static kSecAttrService: *const NSString;
    static kSecAttrAccount: *const NSString;
    static kSecReturnData: *const NSString;
    static kSecMatchLimit: *const NSString;
    static kSecMatchLimitOne: *const NSString;
    fn SecItemCopyMatching(query: *const c_void, result: *mut *const c_void) -> i32;
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
    let salt = b"saltysalt";
    let mut key = [0u8; 16];
    let status = unsafe {
        CCKeyDerivationPBKDF(
            K_CC_PBKDF2,
            password.as_ptr(),
            password.len(),
            salt.as_ptr(),
            salt.len(),
            K_CC_PRF_HMAC_SHA1,
            1003,
            key.as_mut_ptr(),
            key.len(),
        )
    };
    if status != 0 {
        return Err(format!("CommonCrypto could not make the key ({status})."));
    }
    Ok(Some(Key(key)))
}

pub fn decrypt(key: &Key, value: &[u8]) -> Option<Vec<u8>> {
    let sealed = value.strip_prefix(b"v10")?;
    let iv = [b' '; 16];
    let mut out = vec![0u8; sealed.len() + 16];
    let mut moved = 0usize;
    let status = unsafe {
        CCCrypt(
            K_CC_DECRYPT,
            K_CC_AES,
            K_CC_PKCS7_PADDING,
            key.0.as_ptr().cast(),
            key.0.len(),
            iv.as_ptr().cast(),
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
// such item, or the user said no.
fn keychain_password(service: &str, account: &str) -> Result<Option<Vec<u8>>, String> {
    let service = NSString::from_str(service);
    let account = NSString::from_str(account);
    let yes = NSNumber::new_bool(true);
    // The Security framework's own keys and values, which are CFStrings,
    // toll-free bridged to NSString.
    let (class, generic, service_key, account_key, return_data, limit, one) = unsafe {
        (
            &*kSecClass,
            &*kSecClassGenericPassword,
            &*kSecAttrService,
            &*kSecAttrAccount,
            &*kSecReturnData,
            &*kSecMatchLimit,
            &*kSecMatchLimitOne,
        )
    };
    let query: Retained<NSDictionary<NSString, AnyObject>> = NSDictionary::from_slices(
        &[class, service_key, account_key, return_data, limit],
        &[
            generic.as_ref(),
            service.as_ref(),
            account.as_ref(),
            yes.as_ref(),
            one.as_ref(),
        ],
    );
    let mut result: *const c_void = std::ptr::null();
    let status = unsafe { SecItemCopyMatching(Retained::as_ptr(&query).cast(), &mut result) };
    match status {
        0 => {
            // A CFData the caller owns, bridged to NSData.
            let data = unsafe { Retained::from_raw(result.cast_mut().cast::<NSData>()) }
                .ok_or("The Keychain gave no password.")?;
            Ok(Some(data.to_vec()))
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
        let salt = b"saltysalt";
        let mut key = [0u8; 16];
        let password = b"peanuts";
        let status = unsafe {
            CCKeyDerivationPBKDF(
                K_CC_PBKDF2,
                password.as_ptr(),
                password.len(),
                salt.as_ptr(),
                salt.len(),
                K_CC_PRF_HMAC_SHA1,
                1003,
                key.as_mut_ptr(),
                key.len(),
            )
        };
        assert_eq!(status, 0);
        let plain = b"a cookie's value";
        let iv = [b' '; 16];
        let mut sealed = vec![0u8; plain.len() + 16];
        let mut moved = 0usize;
        let status = unsafe {
            CCCrypt(
                0,
                K_CC_AES,
                K_CC_PKCS7_PADDING,
                key.as_ptr().cast(),
                16,
                iv.as_ptr().cast(),
                plain.as_ptr().cast(),
                plain.len(),
                sealed.as_mut_ptr().cast(),
                sealed.len(),
                &mut moved,
            )
        };
        assert_eq!(status, 0);
        sealed.truncate(moved);
        let mut value = b"v10".to_vec();
        value.extend(sealed);
        assert_eq!(decrypt(&Key(key), &value).as_deref(), Some(&plain[..]));
        assert_eq!(decrypt(&Key(key), b"v11whatever"), None);
    }
}
