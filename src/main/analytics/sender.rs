// The thread that sends events to PostHog, in batches: every half minute, at
// fifty events, or when the app quits. A batch that fails is kept and tried
// again with the next, up to a limit, the oldest dropped first. Nothing is
// written to disk: what is queued when the app crashes is lost.

use std::sync::mpsc::{self, RecvTimeoutError};
use std::thread;
use std::time::{Duration, Instant};

use serde_json::{Value, json};

const INTERVAL: Duration = Duration::from_secs(30);
const BATCH: usize = 50;
/// The most events kept while sending fails.
const KEPT: usize = 500;
/// How long a quit waits for what is left to be sent.
const FLUSH_WAIT: Duration = Duration::from_secs(2);

enum Message {
    Event(Value),
    /// Drops what is queued.
    Clear,
    /// Sends now, then answers.
    Flush(mpsc::Sender<()>),
}

pub struct Sender {
    messages: mpsc::Sender<Message>,
}

impl Sender {
    /// Starts the thread, which posts batches to `url` with `key`.
    pub fn start(url: String, key: &'static str) -> Sender {
        let (messages, received) = mpsc::channel();
        let spawned = thread::Builder::new()
            .name("analytics".into())
            .spawn(move || run(received, &url, key));
        if let Err(error) = spawned {
            eprintln!("Wren could not start sending analytics: {error}");
        }
        Sender { messages }
    }

    pub fn send(&self, event: Value) {
        let _ = self.messages.send(Message::Event(event));
    }

    pub fn clear(&self) {
        let _ = self.messages.send(Message::Clear);
    }

    /// Sends what is queued, waiting `FLUSH_WAIT` at most.
    pub fn flush(&self) {
        let (done, sent) = mpsc::channel();
        if self.messages.send(Message::Flush(done)).is_ok() {
            let _ = sent.recv_timeout(FLUSH_WAIT);
        }
    }
}

fn run(messages: mpsc::Receiver<Message>, url: &str, key: &str) {
    let agent: ureq::Agent = ureq::Agent::config_builder()
        .timeout_global(Some(Duration::from_secs(10)))
        .build()
        .into();
    let post = |batch: &[Value]| {
        let body = json!({ "api_key": key, "batch": batch }).to_string();
        agent
            .post(url)
            .header("Content-Type", "application/json")
            .send(&body)
            .is_ok()
    };
    let mut queue = Vec::new();
    let mut next = Instant::now() + INTERVAL;
    loop {
        let message = messages.recv_timeout(next.saturating_duration_since(Instant::now()));
        match message {
            Ok(Message::Event(event)) => {
                queue.push(event);
                if queue.len() >= BATCH {
                    send(&mut queue, post);
                    next = Instant::now() + INTERVAL;
                }
            }
            Ok(Message::Clear) => queue.clear(),
            Ok(Message::Flush(done)) => {
                send(&mut queue, post);
                let _ = done.send(());
            }
            Err(RecvTimeoutError::Timeout) => {
                send(&mut queue, post);
                next = Instant::now() + INTERVAL;
            }
            Err(RecvTimeoutError::Disconnected) => return send(&mut queue, post),
        }
    }
}

// Posts what is queued; on failure keeps it, at most `KEPT`.
fn send(queue: &mut Vec<Value>, post: impl Fn(&[Value]) -> bool) {
    if queue.is_empty() {
        return;
    }
    if post(queue) {
        queue.clear();
    } else if queue.len() > KEPT {
        queue.drain(..queue.len() - KEPT);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keeps_what_fails_up_to_its_limit() {
        let mut queue: Vec<Value> = (0..KEPT + 10).map(Value::from).collect();
        send(&mut queue, |_| false);
        assert_eq!(queue.len(), KEPT);
        // The oldest went.
        assert_eq!(queue[0], Value::from(10));
        send(&mut queue, |_| true);
        assert!(queue.is_empty());
    }
}
