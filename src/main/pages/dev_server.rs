// Answers wren:// requests from Vite's dev server, so a development build
// shows the same pages, at the same addresses, with Vite's live updates.

use std::cell::{Cell, RefCell};
use std::collections::HashMap;
use std::thread;

use wren::{SchemeFailure, SchemeRequest, SchemeResponse};

use crate::platform;

thread_local! {
    // Requests waiting for the server, by ID. A request stays on the main
    // thread; only its ID goes to the thread that fetches it.
    static WAITING: RefCell<HashMap<u64, SchemeRequest>> = RefCell::new(HashMap::new());
    static NEXT_ID: Cell<u64> = const { Cell::new(0) };
}

/// Fetches `url` off the main thread, and answers `request` with it back on
/// the main thread.
pub fn proxy(request: SchemeRequest, url: String) {
    let id = NEXT_ID.with(|next| next.replace(next.get() + 1));
    WAITING.with(|waiting| waiting.borrow_mut().insert(id, request));
    thread::spawn(move || {
        let response = fetch(&url);
        platform::on_main_thread(move || {
            if let Some(request) = WAITING.with(|waiting| waiting.borrow_mut().remove(&id)) {
                let _ = request.respond(response);
            }
        });
    });
}

fn fetch(url: &str) -> SchemeResponse {
    // A 404 from the server is its answer, not a failed load.
    let agent: ureq::Agent = ureq::Agent::config_builder()
        .http_status_as_error(false)
        .build()
        .into();
    let Ok(mut response) = agent.get(url).call() else {
        return SchemeResponse::Failure(SchemeFailure::Failed);
    };
    let headers = response
        .headers()
        .get("content-type")
        .and_then(|value| value.to_str().ok())
        .map(|value| vec![("Content-Type".to_owned(), value.to_owned())])
        .unwrap_or_default();
    let status = response.status().as_u16();
    match response.body_mut().read_to_vec() {
        Ok(body) => SchemeResponse::Data {
            body,
            status,
            headers,
        },
        Err(_) => SchemeResponse::Failure(SchemeFailure::Failed),
    }
}
