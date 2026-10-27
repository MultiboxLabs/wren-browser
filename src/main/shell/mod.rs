// The shell round each page: a window showing one page in a web view, the
// browser's own window, whose title bar, sidebar and panels are the page's,
// or a popup's, whose page is under the system's title bar; what a browser
// window holds (browser.rs), and the list of them (list.rs). What the app
// does with its windows is windows/'s.

mod browser;
mod list;
mod place;
mod plain;
mod tag;
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
    NSScreen, NSTitlebarSeparatorStyle, NSToolbar, NSView, NSVisualEffectBlendingMode,
    NSVisualEffectMaterial, NSVisualEffectState, NSVisualEffectView, NSWindow, NSWindowDelegate,
    NSWindowDidBecomeKeyNotification, NSWindowDidBecomeMainNotification,
    NSWindowDidEndLiveResizeNotification, NSWindowDidEnterFullScreenNotification,
    NSWindowDidExitFullScreenNotification, NSWindowDidResignKeyNotification,
    NSWindowDidResignMainNotification, NSWindowDidResizeNotification, NSWindowStyleMask,
    NSWindowTitleVisibility, NSWindowToolbarStyle, NSWindowWillEnterFullScreenNotification,
    NSWindowWillExitFullScreenNotification,
};
use objc2_foundation::{
    NSIntersectsRect, NSNotification, NSNotificationCenter, NSPoint, NSRect, NSSize, NSString,
    ns_string,
};
use objc2_quartz_core::CATransaction;
use wren::{MainThread, Profile, RequestedBounds, TabCrash, WebView, WebViewKind, WebViewOptions};

use crate::pages::Page;

pub use browser::{BrowserWindow, Popup, WindowId, marks};
pub use list::Windows;
pub use place::Place;
pub use plain::PlainWindow;
pub use tag::Tag;

/// Whether closing the last window quits the app. A Mac app keeps running
/// with none, as Chrome does, until the user quits it.
pub const QUITS_WITH_LAST_WINDOW: bool = !cfg!(target_os = "macos");
use title_bar::TitleBar;

/// Who draws a window's title bar: the page, whose content fills the window
/// and places the window's buttons (a browser window's sidebar), or the
/// system, above the page, with the window's title (a popup's).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TitleBarKind {
    Page,
    System,
}

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
    /// The window's content is `size`, and the user can make it no smaller
    /// than `min_size`. `should_close` answers the window's close button.
    pub fn open(
        profile: &Profile,
        page: &Page,
        title: &str,
        size: (f64, f64),
        min_size: (f64, f64),
        kind: TitleBarKind,
        should_close: impl Fn() -> bool + 'static,
    ) -> Option<PageWindow> {
        let mtm = MainThreadMarker::new().unwrap();
        let options = WebViewOptions {
            kind: WebViewKind::BrowserUi,
            // Only Toggle UI Devtools opens the UI's DevTools, not Inspect.
            disallow_user_devtools_activation: true,
            messages: page.messages,
            embeds_views: page.embeds_views,
            anchors: page.anchors,
            drags_window: true,
            transparent: true,
            ..Default::default()
        };
        let web_view = Rc::new(WebView::new(profile, &page.url(), &options)?);

        // A title bar that is the page's draws nothing, over the content,
        // which fills the window.
        let mut style = NSWindowStyleMask::Titled
            | NSWindowStyleMask::Closable
            | NSWindowStyleMask::Resizable
            | NSWindowStyleMask::Miniaturizable;
        if kind == TitleBarKind::Page {
            style |= NSWindowStyleMask::FullSizeContentView;
        }
        let window = unsafe {
            NSWindow::initWithContentRect_styleMask_backing_defer(
                NSWindow::alloc(mtm),
                NSRect::new(NSPoint::new(0.0, 0.0), NSSize::new(size.0, size.1)),
                style,
                NSBackingStoreType::Buffered,
                false,
            )
        };
        unsafe { window.setReleasedWhenClosed(false) };
        window.setContentMinSize(NSSize::new(min_size.0, min_size.1));
        window.setTitle(&NSString::from_str(title));
        let toolbar = match kind {
            // An empty compact toolbar makes the title bar tall enough for
            // the buttons wherever the page puts them (set_buttons).
            TitleBarKind::Page => {
                window.setTitleVisibility(NSWindowTitleVisibility::Hidden);
                window.setTitlebarAppearsTransparent(true);
                let toolbar =
                    NSToolbar::initWithIdentifier(NSToolbar::alloc(mtm), ns_string!("main"));
                window.setToolbar(Some(&toolbar));
                window.setToolbarStyle(NSWindowToolbarStyle::UnifiedCompact);
                Some(toolbar)
            }
            // No line under the system's: the page's top goes on from it, as
            // a toolbar does.
            TitleBarKind::System => {
                window.setTitlebarSeparatorStyle(NSTitlebarSeparatorStyle::None);
                None
            }
        };
        window.center();
        let delegate = WindowDelegate::new(mtm, Box::new(should_close));
        window.setDelegate(Some(ProtocolObject::from_ref(&*delegate)));

        let content = window.contentView().unwrap();
        let fill = NSAutoresizingMaskOptions::ViewWidthSizable
            | NSAutoresizingMaskOptions::ViewHeightSizable;

        // What shows through the page: the desktop, blurred. Its state is
        // set from the window's, as the page's is (set_active). Under the
        // system's title bar, what the page leaves clear is drawn as the
        // title bar is, so the two are one.
        let backdrop =
            NSVisualEffectView::initWithFrame(NSVisualEffectView::alloc(mtm), content.bounds());
        backdrop.setMaterial(match kind {
            TitleBarKind::Page => NSVisualEffectMaterial::UnderWindowBackground,
            TitleBarKind::System => NSVisualEffectMaterial::Titlebar,
        });
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
        let title_bar = Rc::new(TitleBar {
            system: kind == TitleBarKind::System,
            ..TitleBar::default()
        });
        let lay_out = {
            let (window, toolbar, title_bar) = (window.clone(), toolbar.clone(), title_bar.clone());
            Rc::new(move |full_screen: Option<bool>| {
                if let Some(full_screen) = full_screen {
                    title_bar.full_screen.set(full_screen);
                    if let Some(toolbar) = &toolbar {
                        window.setToolbar((!full_screen).then_some(&**toolbar));
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

    /// Names the window, as the Window menu, the Dock and Mission Control
    /// show it; the title bar does not, as it is the page's.
    pub fn set_title(&self, title: &str) {
        self.window.setTitle(&NSString::from_str(title));
    }

    /// Puts the window just below and right of `other` and at its size, as
    /// AppKit cascades windows; AppKit keeps it on a screen. A window in
    /// full screen has no place to cascade from.
    pub fn cascade_from(&self, other: &PageWindow) {
        if let Some(frame) = other.cascaded(other.window.frame().size) {
            self.window.setFrame_display(frame, false);
        }
    }

    /// Gives a popup's window a content area of `size`, with its frame at
    /// `origin` (AppKit's screen coordinates, as a page asks for it) if a
    /// screen shows it there; or else cascaded from `near`, or else centred.
    /// A page that asked for less gets the window's minimum.
    pub fn place_popup(
        &self,
        size: (f64, f64),
        origin: Option<(f64, f64)>,
        near: Option<&PageWindow>,
    ) {
        let window = &self.window;
        let size = NSSize::new(size.0, size.1);
        window.setContentSize(at_least(size, window.contentMinSize()));
        let size = window.frame().size;
        let asked = origin
            .map(|(x, y)| NSRect::new(NSPoint::new(x, y), size))
            .filter(|&frame| is_on_screen(frame));
        match asked.or_else(|| near?.cascaded(size)) {
            Some(frame) => window.setFrame_display(frame, false),
            None => window.center(),
        }
    }

    // The frame of a window of `size` cascaded from this one, as AppKit
    // cascades windows: its top left just below and right of this one's.
    // None in full screen, which has no place to cascade from.
    fn cascaded(&self, size: NSSize) -> Option<NSRect> {
        const STEP: f64 = 26.0;
        if self.is_full_screen() {
            return None;
        }
        let frame = self.window.frame();
        let top = frame.origin.y + frame.size.height - STEP;
        let origin = NSPoint::new(frame.origin.x + STEP, top - size.height);
        Some(NSRect::new(origin, size))
    }

    /// Puts the window where a restored Browser's window was, or where the
    /// window was when it was kept. AppKit moves it back onto a screen if
    /// that one has gone; without a position, only the size is its own. A
    /// size kept from before the window had a minimum grows to it.
    pub fn restore_frame(&self, bounds: RequestedBounds) {
        let size = NSSize::new(bounds.width, bounds.height);
        let size = at_least(size, self.window.minSize());
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

    /// Where the pointer is over the page, in points from its top left;
    /// None while it is outside the window.
    pub fn pointer(&self) -> Option<(f64, f64)> {
        let content = self.window.contentView()?;
        let at =
            content.convertPoint_fromView(self.window.mouseLocationOutsideOfEventStream(), None);
        let size = content.bounds().size;
        let y = if content.isFlipped() {
            at.y
        } else {
            size.height - at.y
        };
        ((0.0..=size.width).contains(&at.x) && (0.0..=size.height).contains(&y))
            .then_some((at.x, y))
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

    /// Dark or light, as the page's colours are: the blur behind the page
    /// and the window's buttons follow it. The window keeps the system's
    /// appearance, so what is drawn over it (menus, sheets, Chromium's
    /// bubbles) is light or dark as the system is.
    pub fn set_dark(&self, dark: bool) {
        self.backdrop.setAppearance(appearance(dark).as_deref());
        self.title_bar.dark.set(dark);
        self.title_bar.apply(&self.window);
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

/// Closes the key window, as its close button does, if it is a window of
/// its own that shows none of `pages`: the About panel, or a DevTools
/// window, which ⌘W closes in place of a tab. A sheet or a bubble over a
/// page's window stays. Whether it closed one.
pub fn close_other_key_window<'a>(pages: impl IntoIterator<Item = &'a PageWindow>) -> bool {
    let app = NSApplication::sharedApplication(MainThreadMarker::new().unwrap());
    let Some(key) = app.keyWindow() else {
        return false;
    };
    if key.sheetParent().is_some()
        || key.parentWindow().is_some()
        || !key.styleMask().contains(NSWindowStyleMask::Closable)
        || pages
            .into_iter()
            .any(|page| Retained::as_ptr(&page.window) == Retained::as_ptr(&key))
    {
        return false;
    }
    key.performClose(None);
    true
}

// Whether a screen shows some of `frame`.
// AppKit keeps the user from resizing a window below its minimum, but not
// the app.
fn at_least(size: NSSize, min: NSSize) -> NSSize {
    NSSize::new(size.width.max(min.width), size.height.max(min.height))
}

fn is_on_screen(frame: NSRect) -> bool {
    NSScreen::screens(MainThreadMarker::new().unwrap())
        .iter()
        .any(|screen| NSIntersectsRect(screen.visibleFrame(), frame))
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
