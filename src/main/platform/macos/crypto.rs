// macOS's side of platform/crypto.rs: CommonCrypto's HMAC, PBKDF2 and AES,
// in libSystem, so no crate is needed for them.

use std::ffi::c_void;

use crate::platform::Hash;

/// CommonCrypto's `CCHmacContext`, which `CC_HMAC_CONTEXT_SIZE` sizes.
#[repr(C)]
struct HmacContext([u32; 96]);

unsafe extern "C" {
    fn CCHmacInit(context: *mut HmacContext, algorithm: u32, key: *const c_void, key_len: usize);
    fn CCHmacUpdate(context: *mut HmacContext, data: *const c_void, data_len: usize);
    fn CCHmacFinal(context: *mut HmacContext, mac: *mut c_void);
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

const K_CC_PBKDF2: u32 = 2;
#[cfg(test)]
const K_CC_ENCRYPT: u32 = 0;
const K_CC_DECRYPT: u32 = 1;
const K_CC_AES: u32 = 0;
const K_CC_PKCS7_PADDING: u32 = 1;
const AES_BLOCK: usize = 16;

// The hash as `CCHmacAlgorithm` numbers it.
fn hmac_algorithm(hash: Hash) -> u32 {
    match hash {
        Hash::Sha1 => 0,
        Hash::Sha256 => 2,
        Hash::Sha512 => 4,
    }
}

// The hash as `CCPseudoRandomAlgorithm` numbers it.
fn prf(hash: Hash) -> u32 {
    match hash {
        Hash::Sha1 => 1,
        Hash::Sha256 => 3,
        Hash::Sha512 => 5,
    }
}

pub fn hmac(hash: Hash, key: &[u8], parts: &[&[u8]]) -> Vec<u8> {
    let mut context = HmacContext([0; 96]);
    let mut mac = vec![0u8; hash.length()];
    unsafe {
        CCHmacInit(
            &mut context,
            hmac_algorithm(hash),
            key.as_ptr().cast(),
            key.len(),
        );
        for part in parts {
            CCHmacUpdate(&mut context, part.as_ptr().cast(), part.len());
        }
        CCHmacFinal(&mut context, mac.as_mut_ptr().cast());
    }
    mac
}

pub fn pbkdf2(
    hash: Hash,
    password: &[u8],
    salt: &[u8],
    rounds: u32,
    length: usize,
) -> Option<Vec<u8>> {
    let mut derived = vec![0u8; length];
    let status = unsafe {
        CCKeyDerivationPBKDF(
            K_CC_PBKDF2,
            password.as_ptr(),
            password.len(),
            salt.as_ptr(),
            salt.len(),
            prf(hash),
            rounds,
            derived.as_mut_ptr(),
            derived.len(),
        )
    };
    (status == 0).then_some(derived)
}

pub fn decrypt_aes_cbc(key: &[u8], iv: &[u8; 16], data: &[u8], padded: bool) -> Option<Vec<u8>> {
    aes_cbc(K_CC_DECRYPT, key, iv, data, padded)
}

/// `data` encrypted as `decrypt_aes_cbc` decrypts it, to test what reads it.
#[cfg(test)]
pub fn encrypt_aes_cbc(key: &[u8], iv: &[u8; 16], data: &[u8], padded: bool) -> Option<Vec<u8>> {
    aes_cbc(K_CC_ENCRYPT, key, iv, data, padded)
}

fn aes_cbc(op: u32, key: &[u8], iv: &[u8; 16], data: &[u8], padded: bool) -> Option<Vec<u8>> {
    let mut out = vec![0u8; data.len() + AES_BLOCK];
    let mut moved = 0usize;
    let status = unsafe {
        CCCrypt(
            op,
            K_CC_AES,
            if padded { K_CC_PKCS7_PADDING } else { 0 },
            key.as_ptr().cast(),
            key.len(),
            iv.as_ptr().cast(),
            data.as_ptr().cast(),
            data.len(),
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
