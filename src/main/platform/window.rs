// The app's own windows: a window showing one page in a web view (a browser
// window, or a popup's), and the window of Chromium's undocked DevTools.
// What a browser window holds is shell/'s, and what the app does with its
// windows is windows/'s.

use std::cell::{Cell, RefCell};
use std::rc::Rc;

use wren::{Browser, MainThread, RequestedBounds, TabCrash, WebView, WindowState};

use super::current;

/// Who draws a window's title bar: the page, whose content fills the window
/// and places the window's buttons (a browser window's sidebar), or the
/// system, above the page, with the window's title (a popup's).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TitleBarKind {
    Page,
    System,
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
    /// A window of `web_view` (`Page::web_view`), not shown yet. Its content
    /// is `size`, and the user can make it no smaller than `min_size`.
    /// `should_close` answers the window's close button.
    pub fn open(
        web_view: WebView,
        title: &str,
        size: (f64, f64),
        min_size: (f64, f64),
        kind: TitleBarKind,
        should_close: impl Fn() -> bool + 'static,
    ) -> PageWindow {
        let web_view = Rc::new(web_view);
        let native =
            current::window::PageWindow::open(&web_view, title, size, min_size, kind, should_close);

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

    /// Gives a popup's window a content area of `size`, with its frame at
    /// `origin` (the platform's screen coordinates, as a page asks for it)
    /// if a screen shows it there; or else cascaded from `near`, or else
    /// centred. A page that asked for less gets the window's minimum.
    pub fn place_popup(
        &self,
        size: (f64, f64),
        origin: Option<(f64, f64)>,
        near: Option<&PageWindow>,
    ) {
        self.native
            .place_popup(size, origin, near.map(|near| &near.native));
    }

    /// Puts the window where a restored Browser's window was, or where the
    /// window was when it was kept, back on a screen if that one has gone;
    /// without a position, only the size is its own. A size kept from
    /// before the window had a minimum grows to it.
    pub fn restore_frame(&self, bounds: RequestedBounds) {
        self.native.restore_frame(bounds);
    }

    /// Where the window is and how large, as `restore_frame` takes it; none
    /// in full screen, whose frame is the screen's.
    pub fn frame(&self) -> Option<RequestedBounds> {
        self.native.frame()
    }

    /// Whether the window is the one in use: a browser window, or under the
    /// key window (a sheet, or a bubble of Chromium's over it), while the app
    /// is active. A window drawn by its key state alone would look left
    /// whenever a bubble opens.
    // Once the window has a Browser, Browser::is_active says this.
    pub fn is_active(&self) -> bool {
        self.native.is_active()
    }

    /// Where the pointer is over the page, in points from its top left;
    /// None while it is outside the window.
    pub fn pointer(&self) -> Option<(f64, f64)> {
        self.native.pointer()
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
