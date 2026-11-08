// The app's end of the relay Wren Components makes between one of Wren's
// own pages in a tab (wren://migrate) and the app: a page in a tab has no
// `wren` to call the app with, as a web view of the app's has. Each page
// open gets a native port of its own (extensions/wren-components/bridge/),
// whose first message says which page it is, from Chromium; then the page's
// calls, each answered, as `wren.invoke`'s are, and the app's messages to
// it, as `wren.on` gets them. src/renderer/ipc/tab-page.ts is the page's
// side, and ipc/<part>.rs registers each page's calls (`handle_call`).

use std::cell::RefCell;
use std::collections::HashMap;
use std::rc::Rc;

use serde::Serialize;
use serde::de::DeserializeOwned;
use serde_json::{Value, json};
use wren::{NativePort, NativePortEvent, Profile};

use crate::pages::{self, Page, SCHEME};

/// The pages Wren Components relays, which bridge/worker.js lists too.
const RELAYED: [&Page; 1] = [&pages::MIGRATE];

/// A port, from when it opens to its page's word of which page it is.
#[derive(Clone, Copy)]
enum Session {
    Waiting,
    Open { page: &'static str, incognito: bool },
}

type Handler = Rc<dyn Fn(Call)>;

thread_local! {
    static SESSIONS: RefCell<HashMap<NativePort, Session>> = RefCell::default();
    // By page (its host) and call.
    static HANDLERS: RefCell<HashMap<(&'static str, String), Handler>> = RefCell::default();
}

/// One call of a page's, to answer once, then or later. One that is never
/// answered fails as it is dropped.
pub struct Call {
    port: NativePort,
    id: u64,
    args: Value,
    incognito: bool,
    answered: bool,
}

impl Call {
    /// What the page passed, as `V`. It comes from a page: refuse what does
    /// not fit.
    pub fn args<V: DeserializeOwned>(&self) -> Result<V, String> {
        V::deserialize(&self.args).map_err(|error| error.to_string())
    }

    /// The Profile of the page's tab; an incognito tab's original one, so
    /// check `incognito` before changing it.
    pub fn profile(&self) -> Option<Profile> {
        self.port.profile()
    }

    /// Whether the page's tab is incognito.
    pub fn incognito(&self) -> bool {
        self.incognito
    }

    /// Answers the page: the value, or why it could not be had.
    pub fn answer<A: Serialize>(mut self, result: Result<A, String>) {
        self.answered = true;
        let message = match result
            .and_then(|value| serde_json::to_value(value).map_err(|error| error.to_string()))
        {
            Ok(value) => json!({ "id": self.id, "value": value }),
            Err(error) => json!({ "id": self.id, "error": error }),
        };
        send_to(self.port, &message);
    }
}

impl Drop for Call {
    fn drop(&mut self) {
        if !self.answered {
            let message = json!({ "id": self.id, "error": "Wren did not answer." });
            send_to(self.port, &message);
        }
    }
}

/// Answers `page`'s call `name` with `handler`, which answers the `Call`
/// itself, then or later.
pub fn handle_call(page: &'static Page, name: &str, handler: impl Fn(Call) + 'static) {
    HANDLERS.with(|handlers| {
        handlers
            .borrow_mut()
            .insert((page.host, name.to_owned()), Rc::new(handler))
    });
}

/// Sends every open `page` the message `event`, with `value`, as `wren.on`
/// gets one.
pub fn send<V: Serialize + ?Sized>(page: &Page, event: &str, value: &V) {
    let Ok(value) = serde_json::to_value(value) else {
        return;
    };
    let message = json!({ "event": event, "value": value });
    let ports: Vec<NativePort> = SESSIONS.with(|sessions| {
        sessions
            .borrow()
            .iter()
            .filter(|(_, session)| {
                matches!(session, Session::Open { page: host, .. } if *host == page.host)
            })
            .map(|(port, _)| *port)
            .collect()
    });
    for port in ports {
        send_to(port, &message);
    }
}

fn send_to(port: NativePort, message: &Value) {
    // A message over 1 MiB is refused: a page is sent IDs (icons::id), never
    // what they name.
    if let Err(error) = port.send(&message.to_string()) {
        eprintln!("Wren could not send a page a message: {error:?}");
    }
}

/// Each event of each of Wren Components' ports (components.rs).
pub fn serve(port: NativePort, event: NativePortEvent) {
    match event {
        NativePortEvent::Opened => {
            SESSIONS.with(|sessions| sessions.borrow_mut().insert(port, Session::Waiting));
        }
        NativePortEvent::Message(json) => receive(port, &json),
        NativePortEvent::Closed => {
            SESSIONS.with(|sessions| sessions.borrow_mut().remove(&port));
        }
    }
}

fn receive(port: NativePort, json: &str) {
    let Ok(message) = serde_json::from_str::<Value>(json) else {
        return refuse(port);
    };
    let session = SESSIONS.with(|sessions| sessions.borrow().get(&port).copied());
    match session {
        // Its first message: which page it is.
        Some(Session::Waiting) => match opened(&message) {
            Some(open) => {
                SESSIONS.with(|sessions| sessions.borrow_mut().insert(port, open));
            }
            None => refuse(port),
        },
        Some(Session::Open { page, incognito }) => call(port, page, incognito, message),
        None => refuse(port),
    }
}

// The session a port's first message opens: one of `RELAYED`, by the origin
// Chromium gave the service worker.
fn opened(message: &Value) -> Option<Session> {
    let open = message.get("open")?;
    let origin = open.get("origin")?.as_str()?;
    let page = RELAYED
        .iter()
        .find(|page| origin == format!("{SCHEME}://{}", page.host))?;
    Some(Session::Open {
        page: page.host,
        incognito: open.get("incognito")?.as_bool()?,
    })
}

fn call(port: NativePort, page: &'static str, incognito: bool, message: Value) {
    let (Some(id), Some(name)) = (
        message.get("id").and_then(Value::as_u64),
        message.get("call").and_then(Value::as_str),
    ) else {
        return refuse(port);
    };
    let handler =
        HANDLERS.with(|handlers| handlers.borrow().get(&(page, name.to_owned())).cloned());
    let call = Call {
        port,
        id,
        args: message.get("args").cloned().unwrap_or(Value::Null),
        incognito,
        answered: false,
    };
    match handler {
        Some(handler) => handler(call),
        None => call.answer::<()>(Err(format!("The page has no call “{name}”."))),
    }
}

// A port that says what it should not: it is closed, and `Closed` follows.
fn refuse(port: NativePort) {
    SESSIONS.with(|sessions| sessions.borrow_mut().remove(&port));
    let _ = port.close();
}
