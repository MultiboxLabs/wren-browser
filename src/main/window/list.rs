// The browser windows that are open, found by their ID or by a Browser they
// show. A window is handed out as an `Rc`, so a caller keeps it past a call
// that closes it, and the set is never borrowed while one is used.

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
    /// Browser: the one window with no space yet.
    pub fn waiting(&self) -> Option<Rc<BrowserWindow>> {
        self.open
            .borrow()
            .iter()
            .find(|w| w.space().is_none())
            .cloned()
    }

    /// Notes that `id` is the window in use.
    pub fn set_active(&self, id: WindowId) {
        self.last_active.set(Some(id));
    }

    /// The window the user is in: the one in use, or else the last that was,
    /// or else the oldest.
    pub fn front(&self) -> Option<Rc<BrowserWindow>> {
        let open = self.open.borrow();
        open.iter()
            .find(|w| w.page.is_active())
            .or_else(|| open.iter().find(|w| Some(w.id) == self.last_active.get()))
            .or_else(|| open.first())
            .cloned()
    }
}
