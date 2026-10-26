// What stands for a download's file: its thumbnail once it is done, as the
// platform's file manager draws it, or else its type's icon. Each is drawn
// once, and served to the page by an icon's ID (pages/icons.rs).

use std::cell::RefCell;
use std::collections::HashMap;
use std::fs;
use std::path::Path;
use std::time::SystemTime;

use wren::{Download, DownloadStatus};

use crate::pages::icons;
use crate::platform;

/// How large it is drawn, in points: as the shelf shows it.
const SIZE: f64 = 40.0;

// A file, by its path and when it was last changed.
type FileAsIs = (String, Option<SystemTime>);

thread_local! {
    // Each file's thumbnail as it was when drawn, and each type's icon by its
    // extension; either is the ID its PNG is served at, or None for none.
    static THUMBNAILS: RefCell<HashMap<FileAsIs, Option<String>>> = RefCell::default();
    static TYPE_ICONS: RefCell<HashMap<String, Option<String>>> = RefCell::default();
}

/// The ID `download`'s thumbnail is served at, for `done`: its file's, once
/// it is done and still there, or else its type's icon. None for neither.
pub fn thumbnail(download: Download, done: impl FnOnce(Option<String>) + 'static) {
    let name = download.file_name();
    let has_file = download
        .state()
        .is_ok_and(|state| state.status == DownloadStatus::Done && !state.file_removed);
    if !has_file {
        return done(type_icon(&name));
    }
    let path = download.path();
    let modified = fs::metadata(&path).and_then(|meta| meta.modified()).ok();
    let key = (path.clone(), modified);
    if let Some(known) = THUMBNAILS.with_borrow(|all| all.get(&key).cloned()) {
        return done(known.or_else(|| type_icon(&name)));
    }
    platform::file_thumbnail(&path, SIZE, move |png| {
        let thumbnail = png.map(icons::id);
        THUMBNAILS.with_borrow_mut(|all| all.insert(key, thumbnail.clone()));
        done(thumbnail.or_else(|| type_icon(&name)));
    });
}

// The icon of the file's type, by its name's extension.
fn type_icon(name: &str) -> Option<String> {
    let extension = Path::new(name)
        .extension()
        .map(|extension| extension.to_string_lossy().to_lowercase())
        .unwrap_or_default();
    TYPE_ICONS.with_borrow_mut(|all| {
        all.entry(extension)
            .or_insert_with(|| platform::file_type_icon(name, SIZE).map(icons::id))
            .clone()
    })
}
