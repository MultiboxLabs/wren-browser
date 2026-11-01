// Answers wren:// requests from Vite's dev server, so a development build
// shows the same pages, at the same addresses, with Vite's live updates.
//
// A page load asks for hundreds of modules at once. A few threads fetch them
// over one pool of connections: a connection for each at once has the server
// reset some, and a page missing one of its modules never starts.

use std::cell::{Cell, RefCell};
use std::collections::HashMap;
use std::sync::mpsc::{self, Receiver, Sender};
use std::sync::{Arc, Mutex};
use std::thread;

use wren::{SchemeFailure, SchemeRequest, SchemeResponse};

/// How many requests go to the server at once.
const FETCHERS: usize = 6;

struct Fetch {
    id: u64,
    url: String,
}

thread_local! {
    // Requests waiting for the server, by ID. A request stays on the main
    // thread; only its ID goes to the thread that fetches it.
    static WAITING: RefCell<HashMap<u64, SchemeRequest>> = RefCell::new(HashMap::new());
    static NEXT_ID: Cell<u64> = const { Cell::new(0) };
    static FETCHES: Sender<Fetch> = start_fetchers();
}

/// Fetches `url` off the main thread, and answers `request` with it back on
/// the main thread.
pub fn proxy(request: SchemeRequest, url: String) {
    let id = NEXT_ID.with(|next| next.replace(next.get() + 1));
    WAITING.with(|waiting| waiting.borrow_mut().insert(id, request));
    FETCHES.with(|fetches| {
        // The fetchers end only with the process.
        let _ = fetches.send(Fetch { id, url });
    });
}

fn start_fetchers() -> Sender<Fetch> {
    // A 404 from the server is its answer, not a failed load.
    let agent: ureq::Agent = ureq::Agent::config_builder()
        .http_status_as_error(false)
        .build()
        .into();
    let (sender, receiver) = mpsc::channel();
    let receiver = Arc::new(Mutex::new(receiver));
    for _ in 0..FETCHERS {
        let (agent, receiver) = (agent.clone(), receiver.clone());
        thread::spawn(move || fetcher(&agent, &receiver));
    }
    sender
}

fn fetcher(agent: &ureq::Agent, fetches: &Mutex<Receiver<Fetch>>) {
    loop {
        // Held only while it waits for the next, not while it fetches.
        let next = fetches.lock().map(|fetches| fetches.recv());
        let Ok(Ok(Fetch { id, url })) = next else {
            return;
        };
        let response = fetch(agent, &url);
        let _ = wren::post_to_main_thread(move |_| {
            if let Some(request) = WAITING.with(|waiting| waiting.borrow_mut().remove(&id)) {
                let _ = request.respond(response);
            }
        });
    }
}

fn fetch(agent: &ureq::Agent, url: &str) -> SchemeResponse {
    let mut response = match agent.get(url).call() {
        Ok(response) => response,
        Err(error) => {
            eprintln!("Wren could not fetch {url} from the dev server: {error}");
            return SchemeResponse::Failure(SchemeFailure::Failed);
        }
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
        Err(error) => {
            eprintln!("Wren could not read {url} from the dev server: {error}");
            SchemeResponse::Failure(SchemeFailure::Failed)
        }
    }
}
