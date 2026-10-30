// Pictures of tabs' pages for the tab switcher (ipc/tab_switcher.rs),
// served to the page as images on the app's scheme, as icons.rs serves
// icons. Each picture has an ID of its own, so the page never draws one it
// kept from before. The latest `CAPACITY` are kept, whatever tab each is
// of: a picture taken again for the same tab must not take away the one
// the page was just given, as the answers may come in either order.

use std::cell::{Cell, RefCell};
use std::collections::VecDeque;

use wren::{SchemeFailure, SchemeResponse};

/// Where the UI page's previews are, under its host: a preview's ID follows
/// it.
pub const PATH: &str = "previews/";

/// How many pictures are kept: several times what the switcher shows at
/// once, its five cards' and a split's two halves.
const CAPACITY: usize = 40;

struct Preview {
    name: String,
    jpeg: Vec<u8>,
}

thread_local! {
    // Oldest first.
    static PREVIEWS: RefCell<VecDeque<Preview>> = RefCell::default();
    static NEXT_ID: Cell<u64> = const { Cell::new(0) };
}

/// Keeps `jpeg`, a picture of tab `tab`, and answers the ID the page asks
/// for it by, at `PATH`.
pub fn keep(tab: i32, jpeg: Vec<u8>) -> String {
    let number = NEXT_ID.with(|next| next.replace(next.get() + 1));
    let name = format!("{tab}-{number}");
    PREVIEWS.with_borrow_mut(|previews| {
        previews.push_back(Preview {
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
