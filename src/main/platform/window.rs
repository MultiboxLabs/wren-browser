// The app's own windows: a window showing one page in a web view (a browser
// window, or a Mini Wren), and the window of Chromium's undocked DevTools.
// What a browser window holds, and what the app does with its windows, is
// windows/'s.

use std::cell::{Cell, RefCell};
use std::rc::Rc;

use wren::{Browser, MainThread, RequestedBounds, TabCrash, WebView, WindowState};

use super::current;

/// How large a window is, and whether the user can change it.
#[derive(Clone, Copy, Debug)]
pub enum WindowSize {
    /// Its content starts at `size`, and the user can make it no smaller
    /// than `min`; or larger, and take it full screen.
    Resizable { size: (f64, f64), min: (f64, f64) },
    /// Its content is this always, as a setup assistant's is: no resizing,
    /// no zoom and no full screen.
    Fixed((f64, f64)),
}

/// What shows through the page where it draws nothing: the desktop and the
/// windows behind, blurred.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Backdrop {
    /// A window's own, frosted so that little shows through.
    Window,
    /// A floating panel's, clearer, so more of what is behind shows: for a
    /// window that is one panel, as a Mini Wren on the New Tab page is.
    Panel,
}

/// Whether a window brings the app forward as it takes the keyboard.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum WindowKind {
    /// A window: showing it, bringing it forward or clicking it brings the
    /// app forward too.
    Window,
    /// A panel: it takes the keyboard and comes in front of other apps'
    /// windows with the app left in the background, and the app's other
    /// windows where they are, as a window a key opens from any app does.
    /// Clicking it does not bring the app forward either.
    Panel,
}

type CrashWatch = Rc<RefCell<Option<Box<dyn Fn()>>>>;

/// A window showing one page. Its web view drops first, which takes the page
/// out of the window.
pub struct PageWindow {
    pub web_view: Rc<WebView>,
    native: current::window::PageWindow,
    // What `watch_crash` was given.
    crash_watch: CrashWatch,
}

impl PageWindow {
    /// A window of `web_view` (`Page::web_view`), of `kind`, not shown yet.
    /// Its content is as `size` says, and fills the window: the title bar is
    /// the page's to draw, and it places the window's buttons
    /// (`set_buttons`). `should_close` answers the window's close button.
    pub fn open(
        web_view: WebView,
        title: &str,
        size: WindowSize,
        kind: WindowKind,
        should_close: impl Fn() -> bool + 'static,
    ) -> PageWindow {
        let web_view = Rc::new(web_view);
        let native = current::window::PageWindow::open(&web_view, title, size, kind, should_close);

        // The page shows the window once it has drawn what it shows (`show`),
        // so it never opens blank or half drawn. A failed load or a crash
        // shows it too, or it would never open. Wren's `drawn` is too soon:
        // it is true from the page's first frame, before its UI is in it.
        let show = native.shower();
        // The page is not a tab, so nothing else would bring it back from a
        // crash. The handler cannot own the web view (it owns the handler),
        // so it holds it weakly.
        let reloaded = Rc::downgrade(&web_view);
        let crashed = Cell::new(false);
        let crash_watch: CrashWatch = Rc::default();
        let watch = crash_watch.clone();
        web_view.set_changed(Some(Box::new(move |state| {
            let now_crashed = state.crash != TabCrash::None;
            if now_crashed
                && !crashed.get()
                && let Some(web_view) = reloaded.upgrade()
            {
                let _ = web_view.reload();
                if let Some(watch) = &*watch.borrow() {
                    watch();
                }
            }
            crashed.set(now_crashed);
            if state.load_error != 0 || state.crash != TabCrash::None {
                show();
            }
        })));
        let _ = web_view.focus();

        PageWindow {
            web_view,
            native,
            crash_watch,
        }
    }

    /// Shows the window, in front and in use, once; later calls do nothing.
    pub fn show(&self) {
        self.native.show();
    }

    /// Takes the window off the screen, as the app quits; it keeps its
    /// frame.
    pub fn hide(&self) {
        self.native.hide();
    }

    /// Names the window, as the platform's window lists show it; the title
    /// bar does not, as it is the page's.
    pub fn set_title(&self, title: &str) {
        self.native.set_title(title);
    }

    /// Puts the window just below and right of `other` and at its size, as
    /// the platform cascades windows, keeping it on a screen. A window in
    /// full screen has no place to cascade from.
    pub fn cascade_from(&self, other: &PageWindow) {
        self.native.cascade_from(&other.native);
    }

    /// Gives the window a content area of `size`, with its frame at
    /// `origin` (the platform's screen coordinates, as a page asks for it)
    /// if a screen shows it there; or else cascaded from `near`, or else
    /// centred. A size less than the window's minimum gets the minimum.
    pub fn place_as_asked(
        &self,
        size: (f64, f64),
        origin: Option<(f64, f64)>,
        near: Option<&PageWindow>,
    ) {
        self.native
            .place_as_asked(size, origin, near.map(|near| &near.native));
    }

    /// Gives the window a content area of `size`, centred on the pointer,
    /// on the screen it is on, and kept `margin` points inside that
    /// screen's usable area on each side, made smaller to fit there if it
    /// must be. A size less than the window's minimum gets the minimum.
    pub fn place_at_pointer(&self, size: (f64, f64), margin: f64) {
        self.native.place_at_pointer(size, margin);
    }

    /// Gives the window a content area of `size`, its top edge and its
    /// middle staying where they are, but kept `margin` points inside its
    /// screen's usable area on each side, made smaller to fit there if it
    /// must be. A size less than the window's minimum gets the minimum.
    pub fn resize_from_top(&self, size: (f64, f64), margin: f64) {
        self.native.resize_from_top(size, margin);
    }

    /// Puts the window where a restored Browser's window was, or where the
    /// window was when it was kept, back on a screen if that one has gone;
    /// without a position, only the size is its own. A size kept from
    /// before the window had a minimum grows to it.
    pub fn restore_frame(&self, bounds: RequestedBounds) {
        self.native.restore_frame(bounds);
    }

    /// How large the window's content area is, in points, as the calls that
    /// size the window take it.
    pub fn content_size(&self) -> (f64, f64) {
        self.native.content_size()
    }

    /// Calls `resized` each time the user finishes resizing the window by
    /// its edges; not as the app sizes it, nor as its zoom button does.
    pub fn watch_resized(&self, resized: impl Fn() + 'static) {
        self.native.watch_resized(resized);
    }

    /// Where the window is and how large, as `restore_frame` takes it; none
    /// in full screen, whose frame is the screen's.
    pub fn frame(&self) -> Option<RequestedBounds> {
        self.native.frame()
    }

    /// Whether the window is the one in use: the main window while the app
    /// is active, or under the key window (a sheet, or a bubble of
    /// Chromium's over it), as a panel is that has the keyboard with the app
    /// in the background. A window drawn by its key state alone would look
    /// left whenever a bubble opens.
    // Once the window has a Browser, Browser::is_active says this.
    pub fn is_active(&self) -> bool {
        self.native.is_active()
    }

    /// Where the pointer is over the page, in points from its top left;
    /// None while it is outside the window.
    pub fn pointer(&self) -> Option<(f64, f64)> {
        self.native.pointer()
    }

    /// Where the pointer is, as `pointer` says, but beyond the page too: a
    /// negative x is left of the window.
    pub fn pointer_place(&self) -> Option<(f64, f64)> {
        self.native.pointer_place()
    }

    /// Whether a mouse button is held down, wherever the pointer is.
    pub fn pointer_pressed(&self) -> bool {
        self.native.pointer_pressed()
    }

    /// Whether the pointer is the window's to answer: the window is in use,
    /// and the pointer is beyond it, or over it with no other window over
    /// it there. A window not in use has no part in it, even under it.
    pub fn owns_pointer(&self) -> bool {
        self.native.owns_pointer()
    }

    /// Calls `moved` as the pointer moves, over the window or beyond it,
    /// while the window is in use; and as it comes into use and goes out of
    /// it, when `owns_pointer` changes without a move. Nothing is watched
    /// while it is not in use.
    pub fn watch_pointer(&self, mt: MainThread, moved: impl Fn() + 'static) {
        self.native.watch_pointer(mt, moved);
    }

    /// Calls `changed` with is_active whenever it changes, once the platform
    /// has finished moving the focus between windows.
    pub fn watch_active(&self, mt: MainThread, changed: impl Fn(bool) + 'static) {
        self.native.watch_active(mt, changed);
    }

    /// Calls `crashed` each time the page crashes, as it is reloaded.
    pub fn watch_crash(&self, crashed: impl Fn() + 'static) {
        *self.crash_watch.borrow_mut() = Some(Box::new(crashed));
    }

    /// Brings the window to the front, and the app with it, as Chrome does
    /// for a window Chromium wants in front.
    pub fn bring_forward(&self) {
        self.native.bring_forward();
    }

    /// Whether the window is full screen, or going to be.
    pub fn is_full_screen(&self) -> bool {
        self.native.is_full_screen()
    }

    /// Calls `changed` as the window starts to go full screen and to come
    /// back, so the page can lay itself out for it as it does.
    pub fn watch_full_screen(&self, changed: impl Fn(bool) + 'static) {
        self.native.watch_full_screen(changed);
    }

    /// Calls `changed` once the window has gone full screen or come back, or
    /// failed to, with whether it is.
    pub fn watch_full_screen_finished(&self, changed: impl Fn(bool) + 'static) {
        self.native.watch_full_screen_finished(changed);
    }

    /// Takes the window into full screen or out of it, unless it is so
    /// already or going to be.
    pub fn set_full_screen(&self, full_screen: bool) {
        self.native.set_full_screen(full_screen);
    }

    /// Minimises the window, zooms it to fill its screen as its zoom button
    /// does, or brings it back to neither, out of full screen too. Zoomed,
    /// a window in full screen stays so.
    pub fn set_state(&self, state: WindowState) {
        self.native.set_state(state);
    }

    /// Draws what shows through the page as in use or not, as the page
    /// draws itself.
    pub fn set_active(&self, active: bool) {
        self.native.set_active(active);
    }

    /// Dark or light, as the page's colours are: the blur behind the page
    /// and the window's buttons follow it. The window keeps the system's
    /// appearance, so what is drawn over it (menus, sheets, Chromium's
    /// bubbles) is light or dark as the system is.
    pub fn set_dark(&self, dark: bool) {
        self.native.set_dark(dark);
    }

    /// Draws `backdrop` behind the page; a window opens with
    /// `Backdrop::Window`.
    pub fn set_backdrop(&self, backdrop: Backdrop) {
        self.native.set_backdrop(backdrop);
    }

    /// Puts the close, minimise and zoom buttons with the close button's top
    /// left at (x, y), in points from the window's top left, and keeps them
    /// there; or, with no place, hides them (full screen, once the window is
    /// back). One call for both, so they change in the same frame.
    pub fn set_buttons(&self, at: Option<(f64, f64)>) {
        self.native.set_buttons(at);
    }
}

/// Closes the key window, as its close button does, if it is a window of
/// its own that shows none of `pages`: the About panel, or a DevTools
/// window, which ⌘W closes in place of a tab. A sheet or a bubble over a
/// page's window stays. Whether it closed one.
pub fn close_other_key_window<'a>(pages: impl IntoIterator<Item = &'a PageWindow>) -> bool {
    current::window::close_other_key_window(pages.into_iter().map(|page| &page.native))
}

/// The window of Chromium's undocked DevTools, showing its Browser's tab.
/// Its close button closes the Browser, and the app drops the window once
/// Chromium has (`browser_closed`).
pub struct DevToolsWindow(current::window::DevToolsWindow);

impl DevToolsWindow {
    /// Opens the window, in front, sized as Chromium asks for it.
    pub fn new(browser: Browser) -> DevToolsWindow {
        DevToolsWindow(current::window::DevToolsWindow::new(browser))
    }

    /// Shows the Browser's active tab in the window, named for it.
    pub fn show_active_tab(&self) {
        self.0.show_active_tab();
    }
}
