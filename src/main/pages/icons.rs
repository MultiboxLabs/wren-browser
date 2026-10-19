// The icons Chromium draws for the page (a tab's favicon, an extension's
// button, a toast's icon), served to it as images on the app's scheme: the
// page gets an address, not the PNG, which would cross to it in every message.
//
// An icon's address is made from its bytes, so it always names the same image
// and the page may keep it for as long as it likes. The PNGs wait here, from
// the message that names them to the request that fetches them.

use std::cell::RefCell;
use std::collections::hash_map::DefaultHasher;
use std::collections::{HashMap, VecDeque};
use std::hash::{Hash, Hasher};

use wren::{SchemeFailure, SchemeResponse};

use super::{SCHEME, UI};

/// Where the UI page's icons are, under its host.
pub const PATH: &str = "icons/";

/// How many icons are kept. The oldest go first: an address that outlives its
/// icon fails to load until the app names the icon again.
const CAPACITY: usize = 4096;

#[derive(Default)]
struct Icons {
    by_name: HashMap<String, Vec<u8>>,
    // By when they were added, oldest first.
    order: VecDeque<String>,
}

thread_local! {
    static ICONS: RefCell<Icons> = RefCell::default();
}

/// The address the page loads `png` from. It is kept for the request.
pub fn url(png: Vec<u8>) -> String {
    let mut hasher = DefaultHasher::new();
    png.hash(&mut hasher);
    let name = format!("{:016x}", hasher.finish());
    let url = format!("{SCHEME}://{}/{PATH}{name}", UI.host);
    ICONS.with(|icons| {
        let mut icons = icons.borrow_mut();
        if !icons.by_name.contains_key(&name) {
            icons.order.push_back(name.clone());
            icons.by_name.insert(name, png);
            while icons.order.len() > CAPACITY {
                if let Some(oldest) = icons.order.pop_front() {
                    icons.by_name.remove(&oldest);
                }
            }
        }
    });
    url
}

/// The answer to a request for the icon at `name`, the part of its address
/// after `PATH`.
pub fn serve(name: &str) -> SchemeResponse {
    match ICONS.with(|icons| icons.borrow().by_name.get(name).cloned()) {
        Some(png) => SchemeResponse::data(png, "image/png"),
        None => SchemeResponse::Failure(SchemeFailure::NotFound),
    }
}
