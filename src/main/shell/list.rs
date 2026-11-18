// The browser windows that are open, Mini Wrens among them, found by their
// ID or by a Browser they show; the one the user browses in is never a Mini
// Wren. A window is handed out as an `Rc`, so a caller keeps it past a
// call that closes it, and the set is never borrowed while one is used.

use std::cell::{Cell, RefCell};
use std::rc::Rc;

use wren::Browser;

use super::{BrowserWindow, WindowId};

#[derive(Default)]
pub struct Windows {
    // Oldest first.
    open: RefCell<Vec<Rc<BrowserWindow>>>,
    next_id: Cell<u64>,
    // The window that was in use last, for when none is (the app is in the
    // background, or a menu item is chosen with no window key).
    last_active: Cell<Option<WindowId>>,
}

impl Windows {
    /// An ID for a window about to open.
    pub fn next_id(&self) -> WindowId {
        let id = self.next_id.get();
        self.next_id.set(id + 1);
        WindowId(id)
    }

    pub fn add(&self, window: BrowserWindow) {
        self.open.borrow_mut().push(Rc::new(window));
    }

    /// Forgets a window. The caller drops it, which closes it, once it has
    /// finished with what it was called from.
    pub fn remove(&self, id: WindowId) -> Option<Rc<BrowserWindow>> {
        let mut open = self.open.borrow_mut();
        let index = open.iter().position(|window| window.id == id)?;
        if self.last_active.get() == Some(id) {
            self.last_active.set(None);
        }
        Some(open.remove(index))
    }

    pub fn get(&self, id: WindowId) -> Option<Rc<BrowserWindow>> {
        self.open.borrow().iter().find(|w| w.id == id).cloned()
    }

    /// The window showing `browser`.
    pub fn of(&self, browser: &Browser) -> Option<Rc<BrowserWindow>> {
        let open = self.open.borrow();
        open.iter().find(|w| w.has_browser(browser)).cloned()
    }

    /// The window whose key is `key`, unless the user is closing it.
    pub fn by_key(&self, key: &str) -> Option<Rc<BrowserWindow>> {
        let open = self.open.borrow();
        open.iter()
            .find(|w| w.key == key && !w.is_closing())
            .cloned()
    }

    /// The windows that are open now, oldest first.
    pub fn all(&self) -> Vec<Rc<BrowserWindow>> {
        self.open.borrow().clone()
    }

    pub fn len(&self) -> usize {
        self.open.borrow().len()
    }

    /// The window the app opens at startup, while it waits for its first
    /// Browser.
    pub fn waiting(&self) -> Option<Rc<BrowserWindow>> {
        self.open.borrow().iter().find(|w| w.is_waiting()).cloned()
    }

    /// Notes that `id` is the window in use; not a Mini Wren.
    pub fn set_active(&self, id: WindowId) {
        self.last_active.set(Some(id));
    }

    /// The window in use, if one is: the app is in front, and the window is
    /// key. A Mini Wren too.
    pub fn in_use(&self) -> Option<Rc<BrowserWindow>> {
        let open = self.open.borrow();
        open.iter().find(|w| w.page.is_active()).cloned()
    }

    /// The window in use, if it is one the user browses in: not a Mini
    /// Wren.
    pub fn active(&self) -> Option<Rc<BrowserWindow>> {
        self.in_use().filter(|w| !w.is_mini_wren())
    }

    /// The window the user browses in: the one in use, or else the last
    /// that was, or else the oldest; never a Mini Wren, as Chrome's New Tab
    /// and New Window in a popup are its last tabbed window's.
    pub fn front(&self) -> Option<Rc<BrowserWindow>> {
        self.active().or_else(|| {
            let open = self.open.borrow();
            open.iter()
                .find(|w| Some(w.id) == self.last_active.get())
                .or_else(|| open.iter().find(|w| !w.is_mini_wren()))
                .cloned()
        })
    }

    /// The window that takes what is opened for the user, a link or a tab,
    /// as `takes` says which may: the window the user browses in if it may,
    /// or else the newest that may; never a Mini Wren.
    pub fn taking(&self, takes: impl Fn(&BrowserWindow) -> bool) -> Option<Rc<BrowserWindow>> {
        let takes = |window: &Rc<BrowserWindow>| !window.is_mini_wren() && takes(window);
        self.front().filter(takes).or_else(|| {
            let open = self.open.borrow();
            open.iter().rev().find(|window| takes(window)).cloned()
        })
    }
}
