// Whether the pointer is over a window's floating sidebar, or at the edge
// that brings it out. The app works it out from each move it sees
// (`PageWindow::watch_pointer`), as the page cannot: it hears no move beyond
// the window, and a quick one may cross a thin edge between two of its
// events. The page gives the regions, and is told when the answer changes
// (ipc/sidebar.rs).

use std::cell::{Cell, RefCell};

use serde::Deserialize;

use crate::platform::PageWindow;

/// Where the pointer counts, in points from the page's top left, as the
/// page gives it.
#[derive(Default, Deserialize)]
pub struct SidebarRegions {
    /// Where it brings the sidebar out.
    reveal: Vec<Region>,
    /// Where it keeps the sidebar out, once it is.
    keep: Vec<Region>,
    /// Whether the sidebar is out for something other than the pointer:
    /// docked, or held out by what it opened.
    out: bool,
}

/// A rectangle; it may reach beyond the page.
#[derive(Deserialize)]
struct Region {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

impl Region {
    fn contains(&self, (x, y): (f64, f64)) -> bool {
        (self.x..self.x + self.width).contains(&x) && (self.y..self.y + self.height).contains(&y)
    }
}

#[derive(Default)]
pub struct SidebarHover {
    regions: RefCell<SidebarRegions>,
    over: Cell<bool>,
}

impl SidebarHover {
    pub fn is_over(&self) -> bool {
        self.over.get()
    }

    pub fn set_regions(&self, regions: SidebarRegions) {
        *self.regions.borrow_mut() = regions;
    }

    /// Checks the pointer over `page` again: whether it is over now, if
    /// that changed.
    pub fn check(&self, page: &PageWindow) -> Option<bool> {
        let regions = self.regions.borrow();
        // Once the pointer is over, the sidebar is out, though the page has
        // not drawn it yet: what keeps it out counts from then.
        let counted = match self.over.get() || regions.out {
            true => &regions.keep,
            false => &regions.reveal,
        };
        let over = page.pointer_place().is_some_and(|at| {
            counted.iter().any(|region| region.contains(at)) && page.owns_pointer()
        });
        (self.over.replace(over) != over).then_some(over)
    }
}
