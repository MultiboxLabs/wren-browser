// A window showing one page in a web view: the browser's own window, whose
// title bar, sidebar and panels are the page's.

mod browser;
mod list;
mod plain;
mod title_bar;

use std::cell::{Cell, RefCell};
use std::ptr::NonNull;
use std::rc::Rc;

use block2::RcBlock;
use objc2::rc::Retained;
use objc2::runtime::{AnyObject, NSObject, NSObjectProtocol, ProtocolObject};
use objc2::{DefinedClass, MainThreadMarker, MainThreadOnly, define_class, msg_send};
use objc2_app_kit::{
    NSAppearance, NSAppearanceCustomization, NSAppearanceNameAqua, NSAppearanceNameDarkAqua,
    NSApplication, NSApplicationDidBecomeActiveNotification,
    NSApplicationDidResignActiveNotification, NSAutoresizingMaskOptions, NSBackingStoreType,
    NSToolbar, NSView, NSVisualEffectBlendingMode, NSVisualEffectMaterial, NSVisualEffectState,
    NSVisualEffectView, NSWindow, NSWindowDelegate, NSWindowDidBecomeKeyNotification,
    NSWindowDidBecomeMainNotification, NSWindowDidEndLiveResizeNotification,
    NSWindowDidEnterFullScreenNotification, NSWindowDidExitFullScreenNotification,
    NSWindowDidResignKeyNotification, NSWindowDidResignMainNotification,
    NSWindowDidResizeNotification, NSWindowStyleMask, NSWindowTitleVisibility,
    NSWindowToolbarStyle, NSWindowWillEnterFullScreenNotification,
    NSWindowWillExitFullScreenNotification,
};
use objc2_foundation::{
    NSNotification, NSNotificationCenter, NSPoint, NSRect, NSSize, NSString, ns_string,
};
use objc2_quartz_core::CATransaction;
use wren::{MainThread, Profile, RequestedBounds, TabCrash, WebView, WebViewKind, WebViewOptions};

use crate::pages::Page;

pub use browser::{BrowserWindow, WindowId, marks, tagged};
pub use list::Windows;
pub use plain::PlainWindow;

/// Whether closing the last window quits the app. A Mac app keeps running
/// with none, as Chrome does, until the user quits it.
pub const QUITS_WITH_LAST_WINDOW: bool = !cfg!(target_os = "macos");
use title_bar::TitleBar;

/// A window showing one page. Its web view drops first, which takes the page
/// out of the window.
pub struct PageWindow {
    pub web_view: Rc<WebView>,
    window: Retained<NSWindow>,
    // Behind the page, which is see-through where it draws nothing.
    backdrop: Retained<NSVisualEffectView>,
    // A window holds its delegate weakly.
    delegate: Retained<WindowDelegate>,
    observers: RefCell<Vec<Retained<ProtocolObject<dyn NSObjectProtocol>>>>,
    title_bar: Rc<TitleBar>,
}

impl PageWindow {
    /// `should_close` answers the window's close button.
    pub fn open(
        profile: &Profile,
        page: &Page,
        title: &str,
        size: (f64, f64),
        should_close: impl Fn() -> bool + 'static,
    ) -> Option<PageWindow> {
        let mtm = MainThreadMarker::new().unwrap();
        let options = WebViewOptions {
            kind: WebViewKind::BrowserUi,
            messages: page.messages,
            embeds_views: page.embeds_views,
            anchors: page.anchors,
            drags_window: true,
            transparent: true,
            ..Default::default()
        };
        let web_view = Rc::new(WebView::new(profile, &page.url(), &options)?);

        // The title bar is the page's: the content fills the window, under
        // a title bar that draws nothing.
        let window = unsafe {
            NSWindow::initWithContentRect_styleMask_backing_defer(
                NSWindow::alloc(mtm),
                NSRect::new(NSPoint::new(0.0, 0.0), NSSize::new(size.0, size.1)),
                NSWindowStyleMask::Titled
                    | NSWindowStyleMask::Closable
                    | NSWindowStyleMask::Resizable
                    | NSWindowStyleMask::Miniaturizable
                    | NSWindowStyleMask::FullSizeContentView,
                NSBackingStoreType::Buffered,
                false,
            )
        };
        unsafe { window.setReleasedWhenClosed(false) };
        window.setTitle(&NSString::from_str(title));
        window.setTitleVisibility(NSWindowTitleVisibility::Hidden);
        window.setTitlebarAppearsTransparent(true);
        // An empty compact toolbar makes the title bar tall enough for the
        // buttons wherever the page puts them (set_buttons).
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
        backdrop.setMaterial(NSVisualEffectMaterial::UnderWindowBackground);
        backdrop.setBlendingMode(NSVisualEffectBlendingMode::BehindWindow);
        backdrop.setState(NSVisualEffectState::Active);
        backdrop.setAutoresizingMask(fill);
        content.addSubview(&backdrop);

        let view: Retained<NSView> =
            unsafe { Retained::retain(web_view.view().as_ptr().cast()) }.unwrap();
        view.setFrame(content.bounds());
        view.setAutoresizingMask(fill);
        content.addSubview(&view);

        // The page shows the window once it has drawn what it shows (`show`),
        // so it never opens blank or half drawn. A failed load or a crash
        // shows it too, or it would never open. Wren's `drawn` is too soon:
        // it is true from the page's first frame, before its UI is in it.
        let shown = window.clone();
        // The page is not a tab, so nothing else would bring it back from a
        // crash. The handler cannot own the web view (it owns the handler),
        // so it holds it weakly.
        let reloaded = Rc::downgrade(&web_view);
        let crashed = Cell::new(false);
        web_view.set_changed(Some(Box::new(move |state| {
            let now_crashed = state.crash != TabCrash::None;
            if now_crashed
                && !crashed.get()
                && let Some(web_view) = reloaded.upgrade()
            {
                let _ = web_view.reload();
            }
            crashed.set(now_crashed);
            if state.load_error != 0 || state.crash != TabCrash::None {
                show(&shown);
            }
        })));
        let _ = web_view.focus();

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

        Some(PageWindow {
            web_view,
            window,
            backdrop,
            delegate,
            observers: RefCell::new(observers),
            title_bar,
        })
    }

    /// Shows the window, in front and in use, once; later calls do nothing.
    pub fn show(&self) {
        show(&self.window);
    }

    /// Puts the window just below and right of `other` and at its size, as
    /// AppKit cascades windows; AppKit keeps it on a screen. A window in
    /// full screen has no place to cascade from.
    pub fn cascade_from(&self, other: &PageWindow) {
        if other.is_full_screen() {
            return;
        }
        const STEP: f64 = 26.0;
        let frame = other.window.frame();
        let origin = NSPoint::new(frame.origin.x + STEP, frame.origin.y - STEP);
        self.window
            .setFrame_display(NSRect::new(origin, frame.size), false);
    }

    /// Puts the window where a restored Browser's window was, or where the
    /// window was when it was kept. AppKit moves it back onto a screen if
    /// that one has gone; without a position, only the size is its own.
    pub fn restore_frame(&self, bounds: RequestedBounds) {
        let size = NSSize::new(bounds.width, bounds.height);
        let origin = match bounds.origin {
            Some((x, y)) => NSPoint::new(x, y),
            None => self.window.frame().origin,
        };
        let frame = NSRect::new(origin, size);
        let frame = self
            .window
            .constrainFrameRect_toScreen(frame, self.window.screen().as_deref());
        self.window.setFrame_display(frame, false);
    }

    /// Where the window is and how large, as `restore_frame` takes it; none
    /// in full screen, whose frame is the screen's.
    pub fn frame(&self) -> Option<RequestedBounds> {
        if self.is_full_screen() {
            return None;
        }
        let frame = self.window.frame();
        Some(RequestedBounds {
            origin: Some((frame.origin.x, frame.origin.y)),
            width: frame.size.width,
            height: frame.size.height,
        })
    }

    /// Whether the window is the one in use: a browser window, or under the
    /// key window (a sheet, or a bubble of Chromium's over it), while the app
    /// is active. A window drawn by its key state alone would look left
    /// whenever a bubble opens.
    // Once the window has a Browser, Browser::is_active says this.
    pub fn is_active(&self) -> bool {
        is_active(&self.window)
    }

    /// Calls `changed` with is_active whenever it changes, once AppKit has
    /// finished moving key and main between windows.
    pub fn watch_active(&self, mt: MainThread, changed: impl Fn(bool) + 'static) {
        let window = self.window.clone();
        let last = Cell::new(None);
        let check = Rc::new(move || {
            let active = is_active(&window);
            if last.replace(Some(active)) != Some(active) {
                changed(active);
            }
        });
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

    /// Brings the window to the front, and the app with it, as Chrome does
    /// for a window Chromium wants in front.
    pub fn bring_forward(&self) {
        self.window.makeKeyAndOrderFront(None);
        NSApplication::sharedApplication(MainThreadMarker::new().unwrap()).activate();
    }

    /// Whether the window is full screen, or going to be.
    pub fn is_full_screen(&self) -> bool {
        self.title_bar.full_screen.get()
    }

    /// Calls `changed` as the window starts to go full screen and to come
    /// back, so the page can lay itself out for it as it does.
    pub fn watch_full_screen(&self, changed: impl Fn(bool) + 'static) {
        let changed = Rc::new(changed);
        let mut observers = self.observers.borrow_mut();
        for (name, full_screen) in unsafe {
            [
                (NSWindowWillEnterFullScreenNotification, true),
                (NSWindowWillExitFullScreenNotification, false),
            ]
        } {
            let changed = changed.clone();
            observers.push(observe(name, &self.window, move || changed(full_screen)));
        }
        let window = self.window.clone();
        self.delegate
            .on_full_screen_failed(move || changed(is_full_screen(&window)));
    }

    /// Calls `changed` once the window has gone full screen or come back, or
    /// failed to, with whether it is.
    pub fn watch_full_screen_finished(&self, changed: impl Fn(bool) + 'static) {
        let changed = Rc::new(changed);
        let mut observers = self.observers.borrow_mut();
        for name in unsafe {
            [
                NSWindowDidEnterFullScreenNotification,
                NSWindowDidExitFullScreenNotification,
            ]
        } {
            let (changed, window) = (changed.clone(), self.window.clone());
            observers.push(observe(name, &self.window, move || {
                changed(is_full_screen(&window))
            }));
        }
        let window = self.window.clone();
        self.delegate
            .on_full_screen_failed(move || changed(is_full_screen(&window)));
    }

    /// Takes the window into full screen or out of it, unless it is so
    /// already or going to be.
    pub fn set_full_screen(&self, full_screen: bool) {
        if self.is_full_screen() != full_screen {
            self.window.toggleFullScreen(None);
        }
    }

    /// Draws the backdrop as in use or not, as the page draws itself.
    pub fn set_active(&self, active: bool) {
        self.backdrop.setState(if active {
            NSVisualEffectState::Active
        } else {
            NSVisualEffectState::Inactive
        });
    }

    /// Dark or light, as the page's colours are: the window's buttons
    /// follow it.
    pub fn set_dark(&self, dark: bool) {
        self.window.setAppearance(appearance(dark).as_deref());
    }

    /// Dark or light for the blur behind the page, which may differ from the
    /// page's: a saturated colour over a light blur stays bright.
    pub fn set_backdrop_dark(&self, dark: bool) {
        self.backdrop.setAppearance(appearance(dark).as_deref());
    }

    /// Puts the close, minimise and zoom buttons with the close button's top
    /// left at (x, y), in points from the window's top left, and keeps them
    /// there; or, with no place, hides them (full screen, once the window is
    /// back). One call for both, so they change in the same frame.
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
    window.makeKeyAndOrderFront(None);
    NSApplication::sharedApplication(MainThreadMarker::new().unwrap()).activate();
}

fn is_full_screen(window: &NSWindow) -> bool {
    window.styleMask().contains(NSWindowStyleMask::FullScreen)
}

fn is_active(window: &Retained<NSWindow>) -> bool {
    let app = NSApplication::sharedApplication(MainThreadMarker::new().unwrap());
    if !app.isActive() {
        return false;
    }
    if window.isMainWindow() {
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
        self.window.setDelegate(None);
        self.window.close();
    }
}

// What a window's delegate hands on: its close button, to the closure it
// was made with, and a change to or from full screen AppKit could not make,
// which only its delegate hears of.
struct Delegated {
    should_close: Box<dyn Fn() -> bool>,
    full_screen_failed: RefCell<Vec<Box<dyn Fn()>>>,
}

define_class!(
    #[unsafe(super(NSObject))]
    #[thread_kind = MainThreadOnly]
    #[name = "WrenWindowDelegate"]
    #[ivars = Delegated]
    struct WindowDelegate;

    unsafe impl NSObjectProtocol for WindowDelegate {}

    unsafe impl NSWindowDelegate for WindowDelegate {
        #[unsafe(method(windowShouldClose:))]
        fn window_should_close(&self, _sender: &NSWindow) -> bool {
            (self.ivars().should_close)()
        }

        #[unsafe(method(windowDidFailToEnterFullScreen:))]
        fn window_did_fail_to_enter_full_screen(&self, _window: &NSWindow) {
            self.full_screen_failed();
        }

        #[unsafe(method(windowDidFailToExitFullScreen:))]
        fn window_did_fail_to_exit_full_screen(&self, _window: &NSWindow) {
            self.full_screen_failed();
        }
    }
);

impl WindowDelegate {
    fn new(mtm: MainThreadMarker, should_close: Box<dyn Fn() -> bool>) -> Retained<Self> {
        let this = Self::alloc(mtm).set_ivars(Delegated {
            should_close,
            full_screen_failed: RefCell::default(),
        });
        unsafe { msg_send![super(this), init] }
    }

    fn on_full_screen_failed(&self, run: impl Fn() + 'static) {
        self.ivars()
            .full_screen_failed
            .borrow_mut()
            .push(Box::new(run));
    }

    fn full_screen_failed(&self) {
        for run in self.ivars().full_screen_failed.borrow().iter() {
            run();
        }
    }
}
