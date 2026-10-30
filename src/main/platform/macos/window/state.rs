// A page's window minimised into the Dock, zoomed to fill its screen as its
// zoom button does, or neither.

use wren::WindowState;

use super::PageWindow;

impl PageWindow {
    pub fn set_state(&self, state: WindowState) {
        let window = &self.window;
        match state {
            WindowState::Minimized => window.miniaturize(None),
            WindowState::Zoomed => {
                if window.isMiniaturized() {
                    window.deminiaturize(None);
                }
                // Full screen fills the screen already.
                if !self.is_full_screen() && !window.isZoomed() {
                    window.zoom(None);
                }
            }
            WindowState::Normal => {
                if window.isMiniaturized() {
                    window.deminiaturize(None);
                }
                if self.is_full_screen() {
                    self.set_full_screen(false);
                } else if window.isZoomed() {
                    window.zoom(None);
                }
            }
        }
    }
}
