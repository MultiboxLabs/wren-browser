// The key that types a letter in the current keyboard layout, and the
// layout's changes. A hot key is a key code, but the main menu matches the
// character a key types, so a shortcut finds its key here, and again as the
// user picks another layout. Carbon's Text Input Sources and Unicode
// Utilities are in the system: no crate, as only these few calls are needed.

use std::ffi::c_void;
use std::ptr::NonNull;

use block2::RcBlock;
use objc2::rc::Retained;
use objc2::runtime::ProtocolObject;
use objc2_foundation::{
    NSDistributedNotificationCenter, NSNotification, NSObjectProtocol, NSString,
};

#[link(name = "Carbon", kind = "framework")]
unsafe extern "C" {
    fn TISCopyCurrentKeyboardLayoutInputSource() -> *mut c_void;
    fn TISGetInputSourceProperty(source: *mut c_void, key: *const c_void) -> *const c_void;
    static kTISPropertyUnicodeKeyLayoutData: *const c_void;
    fn LMGetKbdType() -> u8;
    fn UCKeyTranslate(
        layout: *const c_void,
        key_code: u16,
        action: u16,
        modifiers: u32,
        keyboard_type: u32,
        options: u32,
        dead_key_state: *mut u32,
        length: usize,
        actual_length: *mut usize,
        chars: *mut u16,
    ) -> i32;
}

unsafe extern "C" {
    fn CFDataGetBytePtr(data: *const c_void) -> *const u8;
    fn CFRelease(object: *const c_void);
}

// Posted to every app as the user picks another input source.
const LAYOUT_CHANGED: &str = "com.apple.Carbon.TISNotifySelectedKeyboardInputSourceChanged";

const KEY_DOWN: u16 = 0;
const NO_DEAD_KEYS: u32 = 1;
// Carbon's modifier state for UCKeyTranslate, a byte: ⌘ alone. A layout may
// type other letters with ⌘ held, as one that types Latin letters only then
// does.
const COMMAND: u32 = 1;
// The key codes there are.
const KEY_CODES: std::ops::Range<u16> = 0..128;

// The key codes of a to z on a US layout, for a layout with no table to
// read.
const US_LETTERS: [u32; 26] = [
    0, 11, 8, 2, 14, 3, 5, 4, 34, 38, 40, 37, 46, 45, 31, 35, 12, 15, 1, 17, 32, 9, 13, 7, 16, 6,
];

/// The key that types `letter`, a to z, with ⌘ in the current layout, as
/// the main menu would match it, or else the US layout's.
pub fn key_code(letter: char) -> Option<u32> {
    let letter = letter.to_ascii_lowercase();
    typed_by(letter).or_else(|| {
        let index = (letter as u32).checked_sub('a' as u32)?;
        US_LETTERS.get(index as usize).copied()
    })
}

fn typed_by(letter: char) -> Option<u32> {
    let source = unsafe { TISCopyCurrentKeyboardLayoutInputSource() };
    if source.is_null() {
        return None;
    }
    let data = unsafe { TISGetInputSourceProperty(source, kTISPropertyUnicodeKeyLayoutData) };
    let found = if data.is_null() {
        None
    } else {
        let layout = unsafe { CFDataGetBytePtr(data) }.cast::<c_void>();
        let keyboard_type = u32::from(unsafe { LMGetKbdType() });
        KEY_CODES.into_iter().find(|&key_code| {
            typed(layout, keyboard_type, key_code).is_some_and(|typed| typed == letter)
        })
    };
    unsafe { CFRelease(source) };
    found.map(u32::from)
}

// The letter `key_code` types with ⌘ in `layout`, in lower case, if it
// types one character.
fn typed(layout: *const c_void, keyboard_type: u32, key_code: u16) -> Option<char> {
    let mut dead_keys = 0;
    let mut chars = [0u16; 4];
    let mut length = 0;
    let status = unsafe {
        UCKeyTranslate(
            layout,
            key_code,
            KEY_DOWN,
            COMMAND,
            keyboard_type,
            NO_DEAD_KEYS,
            &mut dead_keys,
            chars.len(),
            &mut length,
            chars.as_mut_ptr(),
        )
    };
    if status != 0 || length != 1 {
        return None;
    }
    char::from_u32(u32::from(chars[0])).map(|typed| typed.to_ascii_lowercase())
}

/// Calls its closure each time the user picks another keyboard layout, for
/// as long as it is kept.
pub struct LayoutWatch(Retained<ProtocolObject<dyn NSObjectProtocol>>);

impl LayoutWatch {
    pub fn new(changed: impl Fn() + 'static) -> LayoutWatch {
        let block = RcBlock::new(move |_: NonNull<NSNotification>| changed());
        let observer = unsafe {
            NSDistributedNotificationCenter::defaultCenter()
                .addObserverForName_object_queue_usingBlock(
                    Some(&NSString::from_str(LAYOUT_CHANGED)),
                    None,
                    None,
                    &block,
                )
        };
        LayoutWatch(observer)
    }
}

impl Drop for LayoutWatch {
    fn drop(&mut self) {
        unsafe { NSDistributedNotificationCenter::defaultCenter().removeObserver(self.0.as_ref()) };
    }
}
