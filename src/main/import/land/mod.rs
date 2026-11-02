// Landing what a source's reader read in Wren, on the main thread: into the
// profile it goes to (profiles.rs), Chromium's bookmarks (bookmarks.rs) and
// Wren's spaces (spaces.rs). History, cookies and extensions are each one
// call of Wren's, which run.rs makes.

pub mod bookmarks;
pub mod profiles;
pub mod spaces;
