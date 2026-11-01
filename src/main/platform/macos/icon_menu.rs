// macOS's side of platform/icon_menu.rs: the Dock's menu. AppKit asks only the
// application's delegate for it, and that is Chromium's, which Wren gives no
// way to answer, so the delegate's class gets Wren's answer in place of its own.

use std::cell::RefCell;
use std::mem::ManuallyDrop;

use objc2::rc::Retained;
use objc2::runtime::{AnyClass, AnyObject, Imp, Sel};
use objc2::{DefinedClass, MainThreadMarker, MainThreadOnly, define_class, ffi, msg_send, sel};
use objc2_app_kit::{NSApplication, NSMenu, NSMenuItem};
use objc2_foundation::{NSObject, NSObjectProtocol, NSString};

use crate::platform::icon_menu::IconMenuItem;

struct Ivars {
    items: Box<dyn Fn() -> Vec<IconMenuItem>>,
    chosen: Box<dyn Fn(&str)>,
    // The menu open last: AppKit does not own what the delegate returns.
    menu: RefCell<Option<Retained<NSMenu>>>,
}

define_class!(
    // SAFETY: NSObject has no subclassing requirements, and Target does not
    // implement Drop.
    #[unsafe(super(NSObject))]
    #[thread_kind = MainThreadOnly]
    #[ivars = Ivars]
    struct Target;

    unsafe impl NSObjectProtocol for Target {}

    impl Target {
        #[unsafe(method(choose:))]
        fn choose(&self, item: &NSMenuItem) {
            let Some(id) = item
                .representedObject()
                .and_then(|id| id.downcast::<NSString>().ok())
            else {
                return;
            };
            // A Dock menu's item leaves the app where it was.
            let mtm = MainThreadMarker::from(self);
            NSApplication::sharedApplication(mtm).activate();
            (self.ivars().chosen)(&id.to_string());
        }
    }
);

impl Target {
    fn menu(&self, mtm: MainThreadMarker) -> Retained<NSMenu> {
        let menu = NSMenu::new(mtm);
        // Each item says itself whether it is enabled.
        menu.setAutoenablesItems(false);
        for item in (self.ivars().items)() {
            let row = unsafe {
                NSMenuItem::initWithTitle_action_keyEquivalent(
                    NSMenuItem::alloc(mtm),
                    &NSString::from_str(item.label),
                    Some(sel!(choose:)),
                    &NSString::new(),
                )
            };
            unsafe {
                row.setTarget(Some(self));
                row.setRepresentedObject(Some(&NSString::from_str(item.id)));
            }
            row.setEnabled(item.enabled);
            menu.addItem(&row);
        }
        menu
    }
}

thread_local! {
    // There is one icon, and AppKit's call into the delegate carries nothing
    // of Wren's to find it by. Never dropped: AppKit may ask until the process
    // ends, and nothing should run in a thread-local's destructor at exit.
    static TARGET: ManuallyDrop<RefCell<Option<Retained<Target>>>> =
        const { ManuallyDrop::new(RefCell::new(None)) };
}

pub fn set_icon_menu(
    items: impl Fn() -> Vec<IconMenuItem> + 'static,
    chosen: impl Fn(&str) + 'static,
) {
    let mtm = MainThreadMarker::new().unwrap();
    let Some(delegate) = NSApplication::sharedApplication(mtm).delegate() else {
        return eprintln!("Wren found no application delegate for the Dock's menu.");
    };
    let target = Target::alloc(mtm).set_ivars(Ivars {
        items: Box::new(items),
        chosen: Box::new(chosen),
        menu: RefCell::new(None),
    });
    let target: Retained<Target> = unsafe { msg_send![super(target), init] };
    TARGET.with(|slot| *slot.borrow_mut() = Some(target));

    let class: &AnyClass = AsRef::<AnyObject>::as_ref(&*delegate).class();
    // An object return, and the receiver, the selector and the sender.
    let types = c"@@:@";
    unsafe {
        let imp: Imp = std::mem::transmute(
            application_dock_menu
                as unsafe extern "C-unwind" fn(*mut AnyObject, Sel, *mut AnyObject) -> *mut NSMenu,
        );
        ffi::class_replaceMethod(
            std::ptr::from_ref(class).cast_mut(),
            sel!(applicationDockMenu:),
            imp,
            types.as_ptr(),
        );
    }
}

// `applicationDockMenu:`, which returns a menu the caller does not own.
unsafe extern "C-unwind" fn application_dock_menu(
    _delegate: *mut AnyObject,
    _selector: Sel,
    _sender: *mut AnyObject,
) -> *mut NSMenu {
    let mtm = MainThreadMarker::new().unwrap();
    TARGET.with(|target| {
        let target = target.borrow();
        let Some(target) = target.as_ref() else {
            return std::ptr::null_mut();
        };
        let menu = target.menu(mtm);
        let pointer = Retained::as_ptr(&menu).cast_mut();
        *target.ivars().menu.borrow_mut() = Some(menu);
        pointer
    })
}
