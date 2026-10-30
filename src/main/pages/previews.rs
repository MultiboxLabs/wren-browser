// Pictures of tabs' pages for the tab switcher (ipc/tab_switcher.rs),
// served to the page as images on the app's scheme, as icons.rs serves
// icons. A tab keeps only its latest picture, under a new ID each time, so
// the page never draws one it kept from before; the oldest tab's goes once
// `CAPACITY` tabs have one.

use std::cell::{Cell, RefCell};
use std::collections::VecDeque;

use wren::{SchemeFailure, SchemeResponse};

/// Where the UI page's previews are, under its host: a preview's ID follows
/// it.
pub const PATH: &str = "previews/";

/// How many tabs' pictures are kept: more than the switcher shows.
const CAPACITY: usize = 32;

struct Preview {
    tab: i32,
    name: String,
    jpeg: Vec<u8>,
}

thread_local! {
    // Oldest first.
    static PREVIEWS: RefCell<VecDeque<Preview>> = RefCell::default();
    static NEXT_ID: Cell<u64> = const { Cell::new(0) };
}

/// Keeps `jpeg` as the picture of tab `tab`, in place of the one before,
/// and answers the ID the page asks for it by, at `PATH`.
pub fn keep(tab: i32, jpeg: Vec<u8>) -> String {
    let number = NEXT_ID.with(|next| next.replace(next.get() + 1));
    let name = format!("{tab}-{number}");
    PREVIEWS.with_borrow_mut(|previews| {
        previews.retain(|preview| preview.tab != tab);
        previews.push_back(Preview {
            tab,
            name: name.clone(),
            jpeg,
        });
        while previews.len() > CAPACITY {
            previews.pop_front();
        }
    });
    name
}

/// The answer to a request for the preview with ID `name`.
pub fn serve(name: &str) -> SchemeResponse {
    let jpeg = PREVIEWS.with_borrow(|previews| {
        previews
            .iter()
            .find(|preview| preview.name == name)
            .map(|preview| preview.jpeg.clone())
    });
    match jpeg {
        Some(jpeg) => SchemeResponse::data(jpeg, "image/jpeg"),
        None => SchemeResponse::Failure(SchemeFailure::NotFound),
    }
}
