// Files as the platform's file manager shows them: their thumbnails, icons
// and kinds.

use super::current;

/// A file's thumbnail as the platform's file manager draws it, `size`
/// points square at twice that in pixels, as a PNG: a picture's, a
/// document's first page, or else the file's icon. `done` has it later,
/// on the main thread; None if the file is gone or the platform drew none.
pub fn file_thumbnail(path: &str, size: f64, done: impl FnOnce(Option<Vec<u8>>) + 'static) {
    current::files::file_thumbnail(path, size, done)
}

/// The icon the platform's file manager shows for a file named `name`,
/// whether or not there is one: its type's, by its extension. `size` is
/// in points, drawn at twice that in pixels, as a PNG.
pub fn file_type_icon(name: &str, size: f64) -> Option<Vec<u8>> {
    current::files::file_type_icon(name, size)
}

/// The kind of a file named `name`, as the platform's file manager says it,
/// by its extension: "PDF document". None for a name it has no kind for.
pub fn file_kind(name: &str) -> Option<String> {
    current::files::file_kind(name)
}
