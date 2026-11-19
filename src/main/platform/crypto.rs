// The hashes and ciphers another browser locks what it keeps on disk with,
// for opening it (import/), as the platform does them: on macOS,
// CommonCrypto's. HKDF is made here of the platform's HMAC, as it is the
// same on every platform.

use super::current;

/// A hash, for HMAC and PBKDF2.
#[derive(Clone, Copy, Debug)]
pub enum Hash {
    Sha1,
    Sha256,
    Sha512,
}

impl Hash {
    /// How long its digest is, in bytes.
    pub const fn length(self) -> usize {
        match self {
            Hash::Sha1 => 20,
            Hash::Sha256 => 32,
            Hash::Sha512 => 64,
        }
    }
}

/// The HMAC of `parts`, one after another, with `key`.
pub fn hmac(hash: Hash, key: &[u8], parts: &[&[u8]]) -> Vec<u8> {
    current::crypto::hmac(hash, key, parts)
}

/// `length` bytes of PBKDF2 of `password` with `salt`; None if the platform
/// would not make them.
pub fn pbkdf2(
    hash: Hash,
    password: &[u8],
    salt: &[u8],
    rounds: u32,
    length: usize,
) -> Option<Vec<u8>> {
    current::crypto::pbkdf2(hash, password, salt, rounds, length)
}

/// `length` bytes of HKDF (RFC 5869) of `input`, with `salt` and `info`.
pub fn hkdf(hash: Hash, input: &[u8], salt: &[u8], info: &[u8], length: usize) -> Vec<u8> {
    let key = hmac(hash, salt, &[input]);
    let mut out = Vec::with_capacity(length);
    let mut block = Vec::new();
    let mut counter = 1u8;
    while out.len() < length {
        block = hmac(hash, &key, &[&block, info, &[counter]]);
        out.extend_from_slice(&block);
        counter = counter.wrapping_add(1);
    }
    out.truncate(length);
    out
}

/// `data` decrypted with AES in CBC mode, its key 16, 24 or 32 bytes, and
/// its PKCS #7 padding taken off if `padded`; None if `key` does not open
/// it.
pub fn decrypt_aes_cbc(key: &[u8], iv: &[u8; 16], data: &[u8], padded: bool) -> Option<Vec<u8>> {
    current::crypto::decrypt_aes_cbc(key, iv, data, padded)
}

/// `data` encrypted as `decrypt_aes_cbc` decrypts it, to test what reads it.
#[cfg(test)]
pub fn encrypt_aes_cbc(key: &[u8], iv: &[u8; 16], data: &[u8], padded: bool) -> Option<Vec<u8>> {
    current::crypto::encrypt_aes_cbc(key, iv, data, padded)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn hex(text: &str) -> Vec<u8> {
        (0..text.len())
            .step_by(2)
            .map(|at| u8::from_str_radix(&text[at..at + 2], 16).unwrap())
            .collect()
    }

    // RFC 5869's first test case.
    #[test]
    fn hkdf_is_rfc_5869s() {
        let okm = hkdf(
            Hash::Sha256,
            &[0x0b; 22],
            &hex("000102030405060708090a0b0c"),
            &hex("f0f1f2f3f4f5f6f7f8f9"),
            42,
        );
        assert_eq!(
            okm,
            hex(
                "3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865"
            )
        );
    }

    // RFC 4231's second test case, its message given in two parts.
    #[test]
    fn hmac_takes_its_parts_in_order() {
        let mac = hmac(
            Hash::Sha256,
            b"Jefe",
            &[b"what do ya want ", b"for nothing?"],
        );
        assert_eq!(
            mac,
            hex("5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843")
        );
    }
}
