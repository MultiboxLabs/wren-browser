use serde_json::Value;
use wren::{BrowserTab, MainThread, WebView};

use super::{WindowRef, with_browser, with_window};
use crate::perf::PageCounts;
use crate::tabs;

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

    // Answers at once: the page times the channel by it.
    let _ = web_view.handle("perf.ping", move |()| Ok::<_, String>(()));

    // What the page has been sent of its tabs since it last asked.
    let weak = window.clone();
    let _ = web_view.handle("perf.counts", move |()| {
        with_window(&weak, |window| {
            let counts = window.perf_counts.as_ref();
            counts
                .map(PageCounts::take)
                .ok_or_else(|| "There is no performance run.".to_string())
        })
    });

    // Puts tabs of the window's list in a new group, as the tab's menu
    // does. The run that checks the sidebar's drags makes its groups with
    // it, as no drag makes one.
    let weak = window.clone();
    let _ = web_view.handle("perf.group", move |ids: Vec<i32>| {
        if weak.state()?.perf.is_none() {
            return Err("There is no performance run.".to_string());
        }
        with_browser(&weak, |_, browser| {
            let grouped: Vec<_> = ids
                .iter()
                .filter_map(|id| BrowserTab::from_id(mt, *id))
                .collect();
            tabs::new_group(mt, browser, &grouped)
                .map(drop)
                .map_err(|error| format!("{error:?}"))
        })
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
