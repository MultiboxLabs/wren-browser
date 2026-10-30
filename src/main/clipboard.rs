// The clipboard: the links the app copies (Copy URL, a menu's Copy Link).

use wren::{Browser, ClipboardData, Error, MainThread, ProfileKind};

/// Puts a link on the clipboard, as its URL and its text, with its page's
/// title where there is one. One copied off the record is kept out of
/// clipboard history, as Chromium's own copies are.
pub fn copy_link(url: &str, title: Option<String>, off_the_record: bool) -> Result<(), Error> {
    let mt = MainThread::get().ok_or(Error::NotAllowed)?;
    mt.write_clipboard(&ClipboardData {
        url: Some(url.to_owned()),
        url_title: title.filter(|title| !title.is_empty()),
        off_the_record,
        ..Default::default()
    })
}

/// Whether what `browser` shows is off the record, for `copy_link`.
pub fn is_off_the_record(browser: &Browser) -> bool {
    browser
        .profile()
        .is_some_and(|profile| profile.kind() == ProfileKind::OffTheRecord)
}
