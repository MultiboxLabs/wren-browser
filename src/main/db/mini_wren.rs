// What Mini Wren keeps (windows/mini_wren/from_apps.rs), in a row of
// `settings` the page never sees: the size of the page the user last gave a
// Mini Wren that Wren opened itself, which the next one opens at.

use super::Db;
use super::settings::set;

const PAGE_SIZE: &str = "miniWrenPageSize";

impl Db {
    /// The width and height, in points, of the page the user last gave a
    /// Mini Wren that Wren opened; none before they first resize one.
    pub fn mini_wren_page_size(&self) -> Result<Option<(f64, f64)>, String> {
        self.setting(PAGE_SIZE)
    }

    pub fn set_mini_wren_page_size(&self, size: (f64, f64)) -> Result<(), String> {
        set(&self.conn, PAGE_SIZE, &size)
    }
}

#[cfg(test)]
mod tests {
    use crate::db::test_db as db;

    #[test]
    fn keeps_the_last_size_it_is_given() {
        let db = db();
        assert_eq!(db.mini_wren_page_size().unwrap(), None);
        db.set_mini_wren_page_size((800.0, 600.0)).unwrap();
        db.set_mini_wren_page_size((960.0, 720.0)).unwrap();
        assert_eq!(db.mini_wren_page_size().unwrap(), Some((960.0, 720.0)));
    }
}
