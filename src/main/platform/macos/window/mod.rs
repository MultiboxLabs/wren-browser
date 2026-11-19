// macOS's side of platform/window.rs: an NSWindow round the page's web view,
// over a blur of the desktop (an NSVisualEffectView). Its files:
//
// - frame.rs: where the window is and how large;
// - full_screen.rs: going full screen and coming back, and whether it can;
// - state.rs: minimised, zoomed or neither;
// - panel.rs: the window of `WindowKind::Panel`, an NSPanel;
// - delegate.rs: the window's delegate, which hears its close button;
// - title_bar.rs: the close, minimise and zoom buttons, which the page places;
// - pointer.rs: where the pointer is, and its moves, beyond the window too;
// - devtools.rs: the window of Chromium's undocked DevTools;
// - key_window.rs: closing a key window of its own (⌘W).

mod delegate;
mod devtools;
mod frame;
mod full_screen;
mod key_window;
mod panel;
mod pointer;
mod state;
mod title_bar;

use std::cell::{Cell, RefCell};
use std::ptr::NonNull;
use std::rc::Rc;

use block2::RcBlock;
use objc2::rc::Retained;
use objc2::runtime::{AnyObject, NSObjectProtocol, ProtocolObject};
use objc2::{MainThreadMarker, MainThreadOnly};
use objc2_app_kit::{
    NSAppearance, NSAppearanceCustomization, NSAppearanceNameAqua, NSAppearanceNameDarkAqua,
    NSApplication, NSApplicationActivationOptions, NSApplicationDidBecomeActiveNotification,
    NSApplicationDidResignActiveNotification, NSAutoresizingMaskOptions, NSBackingStoreType,
    NSRunningApplication, NSToolbar, NSView, NSVisualEffectBlendingMode, NSVisualEffectMaterial,
    NSVisualEffectState, NSVisualEffectView, NSWindow, NSWindowDidBecomeKeyNotification,
    NSWindowDidBecomeMainNotification, NSWindowDidEndLiveResizeNotification,
    NSWindowDidExitFullScreenNotification, NSWindowDidResignKeyNotification,
    NSWindowDidResignMainNotification, NSWindowDidResizeNotification, NSWindowStyleMask,
    NSWindowTitleVisibility, NSWindowToolbarStyle, NSWindowWillEnterFullScreenNotification,
    NSWorkspace,
};
use objc2_foundation::{
    NSNotification, NSNotificationCenter, NSPoint, NSRect, NSSize, NSString, ns_string,
};
use objc2_quartz_core::CATransaction;
use wren::{MainThread, WebView};

use crate::platform::{Backdrop, WindowKind, WindowSize};
use delegate::WindowDelegate;
use full_screen::is_full_screen;
use title_bar::TitleBar;

pub use devtools::DevToolsWindow;
pub use key_window::close_other_key_window;

pub struct PageWindow {
    window: Retained<NSWindow>,
    // Behind the page, which is see-through where it draws nothing.
    backdrop: Retained<NSVisualEffectView>,
    // A window holds its delegate weakly.
    delegate: Retained<WindowDelegate>,
    observers: RefCell<Vec<Retained<ProtocolObject<dyn NSObjectProtocol>>>>,
    // The app's monitor of the pointer, while the window watches it and is
    // in use (pointer.rs).
    pointer_monitor: Rc<RefCell<Option<Retained<AnyObject>>>>,
    title_bar: Rc<TitleBar>,
}

impl PageWindow {
    pub fn open(
        web_view: &WebView,
        title: &str,
        size: WindowSize,
        kind: WindowKind,
        should_close: impl Fn() -> bool + 'static,
    ) -> PageWindow {
        let mtm = MainThreadMarker::new().unwrap();

        // The title bar is the page's: it draws nothing, over the content,
        // which fills the window.
        let mut style = NSWindowStyleMask::Titled
            | NSWindowStyleMask::Closable
            | NSWindowStyleMask::Miniaturizable
            | NSWindowStyleMask::FullSizeContentView;
        let (size, min_size) = match size {
            WindowSize::Resizable { size, min } => {
                style |= NSWindowStyleMask::Resizable;
                (size, min)
            }
            WindowSize::Fixed(size) => (size, size),
        };
        let frame = NSRect::new(NSPoint::new(0.0, 0.0), NSSize::new(size.0, size.1));
        let window = match kind {
            WindowKind::Window => unsafe {
                NSWindow::initWithContentRect_styleMask_backing_defer(
                    NSWindow::alloc(mtm),
                    frame,
                    style,
                    NSBackingStoreType::Buffered,
                    false,
                )
            },
            WindowKind::Panel => panel::open(mtm, frame, style),
        };
        unsafe { window.setReleasedWhenClosed(false) };
        window.setContentMinSize(NSSize::new(min_size.0, min_size.1));
        window.setTitle(&NSString::from_str(title));
        // An empty compact toolbar makes the title bar tall enough for the
        // buttons wherever the page puts them (set_buttons).
        window.setTitleVisibility(NSWindowTitleVisibility::Hidden);
        window.setTitlebarAppearsTransparent(true);
        let toolbar = NSToolbar::initWithIdentifier(NSToolbar::alloc(mtm), ns_string!("main"));
        window.setToolbar(Some(&toolbar));
        window.setToolbarStyle(NSWindowToolbarStyle::UnifiedCompact);
        window.center();
        let delegate = WindowDelegate::new(mtm, Box::new(should_close));
        window.setDelegate(Some(ProtocolObject::from_ref(&*delegate)));

        let content = window.contentView().unwrap();
        let fill = NSAutoresizingMaskOptions::ViewWidthSizable
            | NSAutoresizingMaskOptions::ViewHeightSizable;

        // What shows through the page: the desktop, blurred. Its state is
        // set from the window's, as the page's is (set_active).
        let backdrop =
            NSVisualEffectView::initWithFrame(NSVisualEffectView::alloc(mtm), content.bounds());
        backdrop.setMaterial(material(Backdrop::Window));
        backdrop.setBlendingMode(NSVisualEffectBlendingMode::BehindWindow);
        backdrop.setState(NSVisualEffectState::Active);
        backdrop.setAutoresizingMask(fill);
        content.addSubview(&backdrop);

        let view: Retained<NSView> =
            unsafe { Retained::retain(web_view.view().as_ptr().cast()) }.unwrap();
        view.setFrame(content.bounds());
        view.setAutoresizingMask(fill);
        content.addSubview(&view);

        // AppKit puts the buttons back whenever it lays the title bar out
        // again, so they go where the page wants them after each time.
        // Full screen, the toolbar would get a bar of its own above the
        // page, so the window has none while it is.
        let title_bar = Rc::new(TitleBar::default());
        let lay_out = {
            let (window, toolbar, title_bar) = (window.clone(), toolbar.clone(), title_bar.clone());
            Rc::new(move |full_screen: Option<bool>| {
                if let Some(full_screen) = full_screen {
                    title_bar.full_screen.set(full_screen);
                    window.setToolbar((!full_screen).then_some(&*toolbar));
                    if !full_screen {
                        full_screen::allow(&window, !title_bar.kept_out_of_full_screen.get());
                    }
                }
                title_bar.apply(&window);
            })
        };
        let observers = unsafe {
            [
                (NSWindowDidResizeNotification, None),
                (NSWindowDidEndLiveResizeNotification, None),
                (NSWindowDidBecomeKeyNotification, None),
                (NSWindowDidResignKeyNotification, None),
                (NSWindowWillEnterFullScreenNotification, Some(true)),
                (NSWindowDidExitFullScreenNotification, Some(false)),
            ]
        }
        .into_iter()
        .map(|(name, full_screen)| {
            let lay_out = lay_out.clone();
            observe(name, &window, move || lay_out(full_screen))
        })
        .collect();
        // AppKit could not go full screen or come back: as the window is.
        let failed = window.clone();
        delegate.on_full_screen_failed(move || lay_out(Some(is_full_screen(&failed))));

        PageWindow {
            window,
            backdrop,
            delegate,
            observers: RefCell::new(observers),
            pointer_monitor: Rc::default(),
            title_bar,
        }
    }

    /// What shows the window, as `show` does, for a handler that cannot
    /// hold the window itself.
    pub fn shower(&self) -> impl Fn() + 'static {
        let window = self.window.clone();
        move || show(&window)
    }

    pub fn show(&self) {
        show(&self.window);
    }

    pub fn hide(&self) {
        self.window.orderOut(None);
    }

    // The Window menu, the Dock and Mission Control show the title. A new one
    // has AppKit lay the title bar out, which puts the buttons back at once.
    pub fn set_title(&self, title: &str) {
        self.window.setTitle(&NSString::from_str(title));
        self.title_bar.apply(&self.window);
    }

    pub fn is_active(&self) -> bool {
        is_active(&self.window)
    }

    pub fn watch_active(&self, mt: MainThread, changed: impl Fn(bool) + 'static) {
        let window = self.window.clone();
        let last = Cell::new(None);
        self.after_focus_moves(mt, move || {
            let active = is_active(&window);
            if last.replace(Some(active)) != Some(active) {
                changed(active);
            }
        });
    }

    // Runs `check` whenever whether the window is in use may have changed:
    // once AppKit has finished moving key and main between windows, and the
    // app has become active or resigned.
    fn after_focus_moves(&self, mt: MainThread, check: impl Fn() + 'static) {
        let check = Rc::new(check);
        let center = NSNotificationCenter::defaultCenter();
        let names = unsafe {
            [
                NSWindowDidBecomeKeyNotification,
                NSWindowDidResignKeyNotification,
                NSWindowDidBecomeMainNotification,
                NSWindowDidResignMainNotification,
                NSApplicationDidBecomeActiveNotification,
                NSApplicationDidResignActiveNotification,
            ]
        };
        let mut observers = self.observers.borrow_mut();
        for name in names {
            let check = check.clone();
            let block = RcBlock::new(move |_: NonNull<NSNotification>| {
                let check = check.clone();
                mt.later(move |_| check());
            });
            observers.push(unsafe {
                center.addObserverForName_object_queue_usingBlock(Some(name), None, None, &block)
            });
        }
    }

    pub fn bring_forward(&self) {
        bring_in_front(&self.window);
    }

    pub fn set_active(&self, active: bool) {
        self.backdrop.setState(if active {
            NSVisualEffectState::Active
        } else {
            NSVisualEffectState::Inactive
        });
    }

    pub fn set_dark(&self, dark: bool) {
        self.backdrop.setAppearance(appearance(dark).as_deref());
        self.title_bar.dark.set(dark);
        self.title_bar.apply(&self.window);
    }

    pub fn set_backdrop(&self, backdrop: Backdrop) {
        self.backdrop.setMaterial(material(backdrop));
    }

    pub fn set_buttons(&self, at: Option<(f64, f64)>) {
        self.title_bar.buttons_hidden.set(at.is_none());
        if at.is_some() {
            self.title_bar.buttons_at.set(at);
        }
        self.title_bar.apply(&self.window);
        // Shows them now: AppKit would leave it until the main thread next
        // goes round its run loop, after whatever of Chromium's work is
        // queued, frames behind the page.
        CATransaction::flush();
    }
}

// Runs `run` on each of the window's notifications by that name.
fn observe(
    name: &NSString,
    window: &NSWindow,
    run: impl Fn() + 'static,
) -> Retained<ProtocolObject<dyn NSObjectProtocol>> {
    let block = RcBlock::new(move |_: NonNull<NSNotification>| run());
    let object: &AnyObject = window;
    unsafe {
        NSNotificationCenter::defaultCenter().addObserverForName_object_queue_usingBlock(
            Some(name),
            Some(object),
            None,
            &block,
        )
    }
}

// The blur macOS draws for `backdrop`: under a window's content, or a
// heads-up display's, which shows more of what is behind it.
fn material(backdrop: Backdrop) -> NSVisualEffectMaterial {
    match backdrop {
        Backdrop::Window => NSVisualEffectMaterial::UnderWindowBackground,
        Backdrop::Panel => NSVisualEffectMaterial::HUDWindow,
    }
}

fn appearance(dark: bool) -> Option<Retained<NSAppearance>> {
    let name = unsafe {
        if dark {
            NSAppearanceNameDarkAqua
        } else {
            NSAppearanceNameAqua
        }
    };
    NSAppearance::appearanceNamed(name)
}

// Brings the window in front and the app with it, the first time only: a
// later call would take the user from a window they went to since.
fn show(window: &NSWindow) {
    if window.isVisible() {
        return;
    }
    bring_in_front(window);
}

// Makes `window` key and brings it in front, and the app with it alone: the
// app's other windows stay where they were. NSApplication's `activate`
// would bring every one of them forward, as a click on the Dock's icon
// does; the running app's activation with no options brings only the key
// and main windows, which `window` now is. A panel that does not bring the
// app forward comes in front of the other apps' windows, and takes the
// keyboard, with the app left as it is.
fn bring_in_front(window: &NSWindow) {
    if takes_keyboard_alone(window) {
        window.orderFrontRegardless();
        window.makeKeyWindow();
        return;
    }
    window.makeKeyAndOrderFront(None);
    NSRunningApplication::currentApplication()
        .activateWithOptions(NSApplicationActivationOptions::empty());
}

// Whether the app is the one in front, as the menu bar shows it. While a
// panel has the keyboard, NSApplication's `isActive` is true even when it
// is not.
fn is_in_front() -> bool {
    NSWorkspace::sharedWorkspace()
        .frontmostApplication()
        .is_some_and(|app| {
            app.processIdentifier()
                == NSRunningApplication::currentApplication().processIdentifier()
        })
}

// Whether `window` is a panel, which takes the keyboard without bringing the
// app forward (panel.rs).
fn takes_keyboard_alone(window: &NSWindow) -> bool {
    window
        .styleMask()
        .contains(NSWindowStyleMask::NonactivatingPanel)
}

// Main while the app is active, or under the key window. While a panel has
// the keyboard, only it and what is over it are in use: AppKit counts the
// app as active then, even with it in the background, and the main window
// is not the one in use.
fn is_active(window: &Retained<NSWindow>) -> bool {
    let app = NSApplication::sharedApplication(MainThreadMarker::new().unwrap());
    let panel_has_keyboard = app
        .keyWindow()
        .is_some_and(|key| takes_keyboard_alone(&key));
    if app.isActive() && !panel_has_keyboard && window.isMainWindow() {
        return true;
    }
    let mut current = app.keyWindow();
    while let Some(key) = current {
        if Retained::as_ptr(&key) == Retained::as_ptr(window) {
            return true;
        }
        current = key.sheetParent().or_else(|| key.parentWindow());
    }
    false
}

impl Drop for PageWindow {
    fn drop(&mut self) {
        let center = NSNotificationCenter::defaultCenter();
        for observer in self.observers.take() {
            unsafe { center.removeObserver(observer.as_ref()) };
        }
        if let Some(monitor) = self.pointer_monitor.take() {
            pointer::remove_monitor(&monitor);
        }
        self.window.setDelegate(None);
        // While a panel has the keyboard, AppKit counts the app as active,
        // even with another app in front, so closing it would give the
        // keyboard to the app's main window, which would come in front for
        // a moment. It goes back to the app in front first.
        if self.window.isKeyWindow() && takes_keyboard_alone(&self.window) && !is_in_front() {
            NSApplication::sharedApplication(MainThreadMarker::new().unwrap()).deactivate();
        }
        self.window.close();
    }
}
