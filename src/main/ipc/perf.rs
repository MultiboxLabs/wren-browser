use std::rc::Rc;

use serde::Deserialize;
use serde_json::Value;
use wren::{BrowserTab, MainThread, MenuItem, WebView};

use super::items::{MenuOf, choose, menu_of};
use super::{WindowRef, with_browser, with_window};
use crate::app::State;
use crate::perf::PageCounts;
use crate::tabs;
use crate::tabs::roles::{self, Role};

#[derive(Deserialize)]
struct Choose {
    #[serde(flatten)]
    of: MenuOf,
    label: String,
}

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
        run(&weak)?;
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

    // Reopens what the window's Browser in front closed last, as the main
    // menu's Reopen Closed Tab does. The run that checks the sidebar's drags
    // brings a pin's closed tab back with it.
    let weak = window.clone();
    let _ = web_view.handle("perf.reopenClosedTab", move |()| {
        run(&weak)?;
        with_browser(&weak, |_, browser| {
            browser
                .reopen_closed_tab()
                .map_err(|error| format!("{error:?}"))
        })
    });

    // The addresses of the tabs of the window's Browsers that are leaving
    // (`Role::Leaving`): closing for a pin that has gone, and drawn nowhere
    // until they have. The run that checks the sidebar's drags waits for
    // none, as one that stayed would be a tab open and hidden.
    let weak = window.clone();
    let _ = web_view.handle("perf.leaving", move |()| {
        run(&weak)?;
        with_window(&weak, |window| {
            let leaving = window
                .browsers()
                .iter()
                .flat_map(|browser| browser.tabs())
                .filter(|tab| roles::of(*tab) == Role::Leaving)
                .map(BrowserTab::url)
                .collect::<Vec<_>>();
            Ok(leaving)
        })
    });

    // What an item's menu holds, without showing it: its items' labels,
    // with " | " for each line between them, a disabled one in brackets,
    // and a submenu's label followed by ">".
    let weak = window.clone();
    let _ = web_view.handle("perf.menu", move |of: MenuOf| {
        let state = run(&weak)?;
        let (_, items) = menu_of(&state, mt, weak.id, &of)?;
        Ok::<_, String>(picture(&items))
    });

    // Does what the item of a label would, chosen from an item's menu, and
    // answers as "items.menu" does. A label the menu has not, or has
    // disabled, fails.
    let weak = window.clone();
    let _ = web_view.handle_call("perf.choose", move |call| {
        let found = call
            .value::<Choose>()
            .map_err(|error| error.to_string())
            .and_then(|choose| {
                let state = run(&weak)?;
                let (subject, items) = menu_of(&state, mt, weak.id, &choose.of)?;
                let id = id_of(&items, &choose.label).ok_or("The menu has no such item.")?;
                Ok((state, subject, id))
            });
        match found {
            Ok((state, subject, id)) => choose(&state, mt, subject, Some(id), move |choice| {
                let _ = call.answer(&choice);
            }),
            Err(error) => {
                let _ = call.fail(&error);
            }
        }
    });

    // The run is over: the app quits, once the call is answered.
    let weak = window.clone();
    let _ = web_view.handle("perf.done", move |()| {
        run(&weak)?;
        mt.later(|mt| mt.quit());
        Ok::<_, String>(())
    });
}

// The app's state during a run, which alone takes the calls that are only
// a run's.
fn run(window: &WindowRef) -> Result<Rc<State>, String> {
    let state = window.state()?;
    match state.perf {
        Some(_) => Ok(state),
        None => Err("There is no performance run.".into()),
    }
}

// A menu's items as one line of text ("perf.menu").
fn picture(items: &[MenuItem]) -> String {
    let mut sections = vec![Vec::new()];
    for item in items {
        let label = match item {
            MenuItem::Separator => {
                sections.push(Vec::new());
                continue;
            }
            MenuItem::Item {
                label,
                enabled: true,
                ..
            } => label.clone(),
            MenuItem::Item { label, .. } => format!("[{label}]"),
            MenuItem::Submenu { label, .. } => format!("{} >", label.as_deref().unwrap_or("")),
            _ => continue,
        };
        if let Some(section) = sections.last_mut() {
            section.push(label);
        }
    }
    let sections: Vec<String> = sections.iter().map(|section| section.join(", ")).collect();
    sections.join(" | ")
}

// The ID of the enabled item of a label, in a menu or a submenu of it.
fn id_of(items: &[MenuItem], wanted: &str) -> Option<String> {
    items.iter().find_map(|item| match item {
        MenuItem::Item {
            id,
            label,
            enabled: true,
            ..
        } if label == wanted => Some(id.clone()),
        MenuItem::Submenu { items, .. } => id_of(items, wanted),
        _ => None,
    })
}
