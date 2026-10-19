use serde_json::Value;
use wren::{MainThread, WebView};

use super::WindowRef;

pub fn handle(web_view: &WebView, window: &WindowRef, mt: MainThread) {
    // The performance run's settings, or null outside one.
    let weak = window.clone();
    let _ = web_view.handle("perf.config", move |()| {
        let state = weak.state()?;
        Ok::<_, String>(state.perf.as_ref().map(|perf| perf.config.clone()))
    });

    let weak = window.clone();
    let _ = web_view.handle("perf.report", move |entry: Value| {
        let state = weak.state()?;
        let perf = state.perf.as_ref().ok_or("There is no performance run.")?;
        perf.record(&entry).map_err(|error| error.to_string())
    });

    // The run is over: the app quits, once the call is answered.
    let weak = window.clone();
    let _ = web_view.handle("perf.done", move |()| {
        let state = weak.state()?;
        if state.perf.is_none() {
            return Err("There is no performance run.".to_string());
        }
        mt.later(|mt| mt.quit());
        Ok(())
    });
}
