// macOS's side of platform/shortcut.rs: a hot key of Carbon's event manager,
// which needs no permission, as an event monitor would. Its key is the one
// that types the letter in the current layout, registered again as the
// layout changes (layout.rs). Carbon is in the system: no crate, as only
// these few calls are needed.

mod layout;

use std::cell::Cell;
use std::ffi::c_void;
use std::rc::Rc;
use std::sync::atomic::{AtomicU32, Ordering};

use wren::{MenuKey, MenuModifiers};

use layout::LayoutWatch;

type OsStatus = i32;
type EventRef = *mut c_void;
type EventTargetRef = *mut c_void;
type EventHandlerRef = *mut c_void;
type EventHotKeyRef = *mut c_void;
type EventHandler = extern "C" fn(*mut c_void, EventRef, *mut c_void) -> OsStatus;

#[repr(C)]
struct EventTypeSpec {
    class: u32,
    kind: u32,
}

#[repr(C)]
#[derive(Clone, Copy, Default, PartialEq, Eq)]
struct EventHotKeyId {
    signature: u32,
    id: u32,
}

#[link(name = "Carbon", kind = "framework")]
unsafe extern "C" {
    fn GetApplicationEventTarget() -> EventTargetRef;
    fn InstallEventHandler(
        target: EventTargetRef,
        handler: EventHandler,
        type_count: u32,
        types: *const EventTypeSpec,
        user_data: *mut c_void,
        handler_ref: *mut EventHandlerRef,
    ) -> OsStatus;
    fn RemoveEventHandler(handler_ref: EventHandlerRef) -> OsStatus;
    fn RegisterEventHotKey(
        key_code: u32,
        modifiers: u32,
        id: EventHotKeyId,
        target: EventTargetRef,
        options: u32,
        hot_key: *mut EventHotKeyRef,
    ) -> OsStatus;
    fn UnregisterEventHotKey(hot_key: EventHotKeyRef) -> OsStatus;
    fn GetEventParameter(
        event: EventRef,
        name: u32,
        desired_type: u32,
        actual_type: *mut u32,
        size: usize,
        actual_size: *mut usize,
        data: *mut c_void,
    ) -> OsStatus;
}

const fn four_cc(code: &[u8; 4]) -> u32 {
    u32::from_be_bytes(*code)
}

const KEYBOARD: u32 = four_cc(b"keyb");
const HOT_KEY_PRESSED: u32 = 5;
const DIRECT_OBJECT: u32 = four_cc(b"----");
const HOT_KEY_ID: u32 = four_cc(b"hkid");
const NOT_HANDLED: OsStatus = -9874;
const SIGNATURE: u32 = four_cc(b"Wren");

// Carbon's modifiers, as RegisterEventHotKey takes them.
const COMMAND: u32 = 1 << 8;
const SHIFT: u32 = 1 << 9;
const OPTION: u32 = 1 << 11;
const CONTROL: u32 = 1 << 12;

// Tells each shortcut's events from the others'.
static NEXT_ID: AtomicU32 = AtomicU32::new(1);

pub struct GlobalShortcut {
    hot_key: Rc<HotKey>,
    handler: EventHandlerRef,
    // Read by `pressed_event` through the handler's user data, so it stays
    // put until the handler is gone.
    _pressed: Box<Pressed>,
    // Kept for its drop, which stops the watch.
    _layout_watch: LayoutWatch,
}

// What the handler needs: its own hot key's ID, and what to do.
struct Pressed {
    id: EventHotKeyId,
    on_press: Box<dyn Fn()>,
}

// The letter and modifiers, and the hot key registered for them, if one is.
struct HotKey {
    letter: char,
    modifiers: u32,
    id: EventHotKeyId,
    registered: Cell<EventHotKeyRef>,
}

impl GlobalShortcut {
    pub fn new(key: &MenuKey, on_press: impl Fn() + 'static) -> Option<GlobalShortcut> {
        let (letter, modifiers) = letter_and_modifiers(key)?;
        let id = EventHotKeyId {
            signature: SIGNATURE,
            id: NEXT_ID.fetch_add(1, Ordering::Relaxed),
        };
        let mut pressed = Box::new(Pressed {
            id,
            on_press: Box::new(on_press),
        });
        let handler = install_handler(&mut pressed)?;
        let hot_key = Rc::new(HotKey {
            letter,
            modifiers,
            id,
            registered: Cell::new(std::ptr::null_mut()),
        });
        if !hot_key.register() {
            unsafe { RemoveEventHandler(handler) };
            return None;
        }
        let again = Rc::downgrade(&hot_key);
        let layout_watch = LayoutWatch::new(move || {
            if let Some(hot_key) = again.upgrade() {
                hot_key.unregister();
                if !hot_key.register() {
                    eprintln!("Wren lost a shortcut as the keyboard layout changed.");
                }
            }
        });
        Some(GlobalShortcut {
            hot_key,
            handler,
            _pressed: pressed,
            _layout_watch: layout_watch,
        })
    }
}

impl Drop for GlobalShortcut {
    fn drop(&mut self) {
        self.hot_key.unregister();
        unsafe { RemoveEventHandler(self.handler) };
    }
}

impl HotKey {
    // Registers the key that types the letter now. Whether it could.
    fn register(&self) -> bool {
        let Some(key_code) = layout::key_code(self.letter) else {
            return false;
        };
        let target = unsafe { GetApplicationEventTarget() };
        let mut hot_key = std::ptr::null_mut();
        let status = unsafe {
            RegisterEventHotKey(key_code, self.modifiers, self.id, target, 0, &mut hot_key)
        };
        if status != 0 {
            return false;
        }
        self.registered.set(hot_key);
        true
    }

    fn unregister(&self) {
        let hot_key = self.registered.replace(std::ptr::null_mut());
        if !hot_key.is_null() {
            unsafe { UnregisterEventHotKey(hot_key) };
        }
    }
}

// The letter of `key`, a to z, in lower case, and Carbon's modifiers for
// it. An upper-case letter is the letter with Shift, as in a menu.
fn letter_and_modifiers(key: &MenuKey) -> Option<(char, u32)> {
    let mut chars = key.key.chars();
    let letter = chars.next().filter(char::is_ascii_alphabetic)?;
    if chars.next().is_some() {
        return None;
    }
    let mut modifiers = [
        (MenuModifiers::PRIMARY, COMMAND),
        (MenuModifiers::SHIFT, SHIFT),
        (MenuModifiers::ALT, OPTION),
        (MenuModifiers::CONTROL, CONTROL),
    ]
    .into_iter()
    .filter(|(modifier, _)| key.modifiers.contains(*modifier))
    .fold(0, |flags, (_, flag)| flags | flag);
    if letter.is_ascii_uppercase() {
        modifiers |= SHIFT;
    }
    Some((letter.to_ascii_lowercase(), modifiers))
}

// Installs `pressed_event` on the app's events for `pressed`'s hot key.
fn install_handler(pressed: &mut Pressed) -> Option<EventHandlerRef> {
    let spec = EventTypeSpec {
        class: KEYBOARD,
        kind: HOT_KEY_PRESSED,
    };
    let user_data = (pressed as *mut Pressed).cast();
    let mut handler = std::ptr::null_mut();
    let status = unsafe {
        InstallEventHandler(
            GetApplicationEventTarget(),
            pressed_event,
            1,
            &spec,
            user_data,
            &mut handler,
        )
    };
    (status == 0).then_some(handler)
}

// Each shortcut's handler hears every hot key the app has, and takes only
// its own.
extern "C" fn pressed_event(_: *mut c_void, event: EventRef, user_data: *mut c_void) -> OsStatus {
    let pressed = unsafe { &*user_data.cast::<Pressed>() };
    let mut id = EventHotKeyId::default();
    let status = unsafe {
        GetEventParameter(
            event,
            DIRECT_OBJECT,
            HOT_KEY_ID,
            std::ptr::null_mut(),
            size_of::<EventHotKeyId>(),
            std::ptr::null_mut(),
            (&mut id as *mut EventHotKeyId).cast(),
        )
    };
    if status != 0 || id != pressed.id {
        return NOT_HANDLED;
    }
    (pressed.on_press)();
    0
}
