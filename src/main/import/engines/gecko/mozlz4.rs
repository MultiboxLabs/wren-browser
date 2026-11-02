// Mozilla's LZ4 files (`.jsonlz4`): the magic `mozLz40\0`, the size of what
// they hold as a little-endian u32, then one LZ4 block. LZ4's block format is
// small enough to read here, rather than take a crate for it.

/// What the file holds; None if it is not one, or its block is broken.
pub fn decompress(file: &[u8]) -> Option<Vec<u8>> {
    let rest = file.strip_prefix(b"mozLz40\0")?;
    let size = u32::from_le_bytes(rest.get(..4)?.try_into().ok()?) as usize;
    block(rest.get(4..)?, size)
}

/// An LZ4 block, which decompresses to `size` bytes: sequences of a token,
/// literals, then a match of what came before, by its offset back.
pub fn block(input: &[u8], size: usize) -> Option<Vec<u8>> {
    let mut out = Vec::with_capacity(size);
    let mut at = 0;
    // A length of 15 goes on in the bytes after, each adding up to 255.
    let length = |at: &mut usize, mut length: usize| -> Option<usize> {
        if length == 15 {
            loop {
                let byte = *input.get(*at)?;
                *at += 1;
                length += byte as usize;
                if byte != 255 {
                    break;
                }
            }
        }
        Some(length)
    };
    while at < input.len() {
        let token = input[at];
        at += 1;
        let literals = length(&mut at, (token >> 4) as usize)?;
        out.extend_from_slice(input.get(at..at + literals)?);
        at += literals;
        // The last sequence has literals only.
        if at >= input.len() {
            break;
        }
        let offset = u16::from_le_bytes([*input.get(at)?, *input.get(at + 1)?]) as usize;
        at += 2;
        let matched = length(&mut at, (token & 15) as usize)? + 4;
        if offset == 0 || offset > out.len() || out.len() + matched > size {
            return None;
        }
        // A match may reach into what it is making, so a byte at a time.
        let from = out.len() - offset;
        for index in 0..matched {
            out.push(out[from + index]);
        }
    }
    (out.len() == size).then_some(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decompresses_literals_and_a_match_over_itself() {
        // "abc", then a match 3 back for 9 bytes: "abcabcabcabc".
        let input = [0x35, b'a', b'b', b'c', 3, 0];
        assert_eq!(block(&input, 12).as_deref(), Some(&b"abcabcabcabc"[..]));
        let mut file = b"mozLz40\0".to_vec();
        file.extend(12u32.to_le_bytes());
        file.extend(input);
        assert_eq!(decompress(&file).as_deref(), Some(&b"abcabcabcabc"[..]));
    }

    #[test]
    fn refuses_a_match_before_the_start() {
        assert_eq!(block(&[0x10, b'a', 5, 0], 5), None);
        assert_eq!(decompress(b"notmozlz4"), None);
    }
}
