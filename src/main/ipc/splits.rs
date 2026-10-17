use std::rc::Rc;

use serde::{Deserialize, Serialize};
use wren::{BrowserTab, MainThread, SplitLayout, TabSplit, WebView};

use super::{failed, with_browser};
use crate::app::State;

/// Two tabs shown side by side, or one above the other, as one.
#[derive(Serialize)]
pub struct Split {
    id: String,
    /// The left or top tab's ID.
    first: i32,
    second: i32,
    /// The first tab's share, between 0 and 1.
    ratio: f64,
    /// One above the other.
    stacked: bool,
}

impl Split {
    /// None while the split's tabs are not there to name.
    pub fn new(split: TabSplit) -> Option<Split> {
        let state = split.state().ok()?;
        Some(Split {
            id: split.to_string(),
            first: state.first?.id(),
            second: state.second?.id(),
            ratio: state.ratio,
            stacked: state.layout == SplitLayout::Stacked,
        })
    }
}

#[derive(Deserialize)]
struct Ratio {
    id: String,
    ratio: f64,
    /// While the divider is still being dragged.
    dragging: bool,
}

pub fn handle(web_view: &WebView, state: &Rc<State>, mt: MainThread) {
    // The divider between a split's tabs, as it is dragged.
    let weak = Rc::downgrade(state);
    let _ = web_view.handle("splits.setRatio", move |to: Ratio| {
        with_browser(&weak, |_, browser| {
            let split = TabSplit::parse(mt, &to.id)
                .filter(|split| {
                    let first = split.state().ok().and_then(|state| state.first);
                    first.and_then(BrowserTab::browser).as_ref() == Some(browser)
                })
                .ok_or("There is no such split.")?;
            split
                .set_ratio(to.ratio.clamp(0.0, 1.0), to.dragging)
                .map_err(failed)
        })
    });
}
