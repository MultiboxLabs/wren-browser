// A window showing one page in a web view: the browser's own window, whose
// title bar, sidebar and panels are the page's.

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
    NSButton, NSToolbar, NSView, NSVisualEffectBlendingMode, NSVisualEffectMaterial,
    NSVisualEffectState, NSVisualEffectView, NSWindow, NSWindowButton, NSWindowDelegate,
    NSWindowDidBecomeKeyNotification, NSWindowDidBecomeMainNotification,
    NSWindowDidEndLiveResizeNotification, NSWindowDidExitFullScreenNotification,
    NSWindowDidResignKeyNotification, NSWindowDidResignMainNotification,
    NSWindowDidResizeNotification, NSWindowStyleMask, NSWindowTitleVisibility,
    NSWindowToolbarStyle, NSWindowWillEnterFullScreenNotification,
    NSWindowWillExitFullScreenNotification,
};
use objc2_foundation::{
    NSNotification, NSNotificationCenter, NSPoint, NSRect, NSSize, NSString, ns_string,
};
use wren::{MainThread, Profile, TabCrash, WebView, WebViewKind, WebViewOptions};

use crate::pages::Page;

/// A window showing one page. Its web view drops first, which takes the page
/// out of the window.
pub struct PageWindow {
    pub web_view: WebView,
    window: Retained<NSWindow>,
    // Behind the page, which is see-through where it draws nothing.
    backdrop: Retained<NSVisualEffectView>,
    // A window holds its delegate weakly.
    _delegate: Retained<WindowDelegate>,
    observers: RefCell<Vec<Retained<ProtocolObject<dyn NSObjectProtocol>>>>,
    title_bar: Rc<TitleBar>,
}

// The window's buttons as the page wants them, and whether the window is
// full screen, where AppKit shows them in a title bar of its own instead.
#[derive(Default)]
struct TitleBar {
    full_screen: Cell<bool>,
    buttons_at: Cell<Option<(f64, f64)>>,
    buttons_hidden: Cell<bool>,
}

impl TitleBar {
    // Puts the buttons where the page wants them; full screen, leaves them
    // to AppKit, shown.
    fn apply(&self, window: &NSWindow) {
        let full_screen = self.full_screen.get();
        for button in buttons(window).into_iter().flatten() {
            button.setHidden(!full_screen && self.buttons_hidden.get());
        }
        if let (false, Some(at)) = (full_screen, self.buttons_at.get()) {
            place_buttons(window, at);
        }
    }
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
            drags_window: true,
            transparent: true,
            ..Default::default()
        };
        let web_view = WebView::new(profile, &page.url(), &options)?;

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
        // buttons wherever the page puts them (set_buttons_position).
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

        // Shows the window once the page has drawn, so it never opens blank;
        // on a failed load or a crash too, or it would never open.
        let shown = window.clone();
        web_view.set_changed(Some(Box::new(move |state| {
            if (state.drawn || state.load_error != 0 || state.crash != TabCrash::None)
                && !shown.isVisible()
            {
                shown.makeKeyAndOrderFront(None);
                NSApplication::sharedApplication(MainThreadMarker::new().unwrap()).activate();
            }
        })));
        let _ = web_view.focus();

        // AppKit puts the buttons back whenever it lays the title bar out
        // again, so they go where the page wants them after each time.
        // Full screen, the toolbar would get a bar of its own above the
        // page, so the window has none while it is.
        let title_bar = Rc::new(TitleBar::default());
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
            let (window, toolbar, title_bar) = (window.clone(), toolbar.clone(), title_bar.clone());
            observe(name, &window.clone(), move || {
                if let Some(full_screen) = full_screen {
                    title_bar.full_screen.set(full_screen);
                    window.setToolbar((!full_screen).then_some(&*toolbar));
                }
                title_bar.apply(&window);
            })
        })
        .collect();

        Some(PageWindow {
            web_view,
            window,
            backdrop,
            _delegate: delegate,
            observers: RefCell::new(observers),
            title_bar,
        })
    }

    /// Whether the window is the one in use: the main window, or under the
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
    /// there.
    pub fn set_buttons_position(&self, x: f64, y: f64) {
        self.title_bar.buttons_at.set(Some((x, y)));
        self.title_bar.apply(&self.window);
    }

    /// Shows or hides the close, minimise and zoom buttons (full screen,
    /// once the window is back).
    pub fn set_buttons_visible(&self, visible: bool) {
        self.title_bar.buttons_hidden.set(!visible);
        self.title_bar.apply(&self.window);
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

// The close, minimise and zoom buttons.
fn buttons(window: &NSWindow) -> [Option<Retained<NSButton>>; 3] {
    [
        NSWindowButton::CloseButton,
        NSWindowButton::MiniaturizeButton,
        NSWindowButton::ZoomButton,
    ]
    .map(|kind| window.standardWindowButton(kind))
}

fn place_buttons(window: &NSWindow, (x, y): (f64, f64)) {
    let [Some(close), Some(minimise), Some(zoom)] = buttons(window) else {
        return;
    };
    // Keeps AppKit's spacing between them.
    let spacing = minimise.frame().origin.x - close.frame().origin.x;
    let height = window.frame().size.height;
    for (index, button) in [close, minimise, zoom].iter().enumerate() {
        let Some(superview) = (unsafe { button.superview() }) else {
            continue;
        };
        let size = button.frame().size;
        let in_window = NSPoint::new(x + spacing * index as f64, height - y - size.height);
        button.setFrameOrigin(superview.convertPoint_fromView(in_window, None));
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

// Hands a window's close button to the closure it was made with.
define_class!(
    #[unsafe(super(NSObject))]
    #[thread_kind = MainThreadOnly]
    #[name = "WrenWindowDelegate"]
    #[ivars = Box<dyn Fn() -> bool>]
    struct WindowDelegate;

    unsafe impl NSObjectProtocol for WindowDelegate {}

    unsafe impl NSWindowDelegate for WindowDelegate {
        #[unsafe(method(windowShouldClose:))]
        fn window_should_close(&self, _sender: &NSWindow) -> bool {
            (self.ivars())()
        }
    }
);

impl WindowDelegate {
    fn new(mtm: MainThreadMarker, should_close: Box<dyn Fn() -> bool>) -> Retained<Self> {
        let this = Self::alloc(mtm).set_ivars(should_close);
        unsafe { msg_send![super(this), init] }
    }
}
