// The calls a page makes that act on its Browser's tabs: open, switch, close,
// move, split and their menus, and what the app says of a tab beside the
// list: the link under the pointer and its picture. The tabs
// themselves, as the page draws them, are in tabs.rs.

use serde::{Deserialize, Serialize};
use wren::{Browser, BrowserTab, MainThread, TabGroup, TabStatus, WebView};

use super::{MenuAt, WindowRef, failed, menu_call, with_browser, with_window};
use crate::analytics::{Event, SplitFrom, TabFrom};
use crate::app::State;
use crate::clipboard;
use crate::db::SpaceId;
use crate::menus::{self, ADD_FAVORITE, Keeps, PIN_TAB};
use crate::pins::{self, PinTarget};
use crate::shell::{BrowserWindow, Place};
use crate::tabs;

/// What "tabs.previewChanged" says: a new picture of a tab's page.
#[derive(Serialize)]
struct PreviewChanged {
    tab: i32,
    /// The ID it is served at (`previewUrl`).
    preview: String,
}

/// The address of the link under the pointer in a tab's page, or of the
/// link with the keyboard, which the page shows over it ("tab.status").
#[derive(Serialize)]
struct Status {
    tab: i32,
    link: Option<String>,
}

/// What the page moves, by one of its tabs: the tab, the split it is in, or
/// its group.
#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
enum Movable {
    Tab(i32),
    Split(i32),
    Group(i32),
}

/// Two tabs to be shown side by side, as the page has them: the left one
/// first.
#[derive(Deserialize)]
struct Pair {
    first: i32,
    second: i32,
}

/// A tab to mute or unmute.
#[derive(Deserialize)]
struct SetMuted {
    id: i32,
    muted: bool,
}

/// An address dropped on the list, to open where it was dropped.
#[derive(Deserialize)]
struct OpenAt {
    url: String,
    /// Among the list's tabs (`tabs::listed`).
    index: usize,
    /// One of the tabs of the group it opens in, or none.
    group: Option<i32>,
}

#[derive(Deserialize)]
struct MoveTo {
    unit: Movable,
    /// Where its first tab goes, among the list's tabs (`tabs::listed`).
    index: usize,
    /// For a tab: one of the tabs of the group it ends in, or none for no
    /// group. A split or a group stays as it is.
    group: Option<i32>,
}

#[derive(Deserialize)]
struct MoveToSpace {
    unit: Movable,
    space: SpaceId,
    /// Where its first tab goes, among the space's list's tabs.
    index: usize,
    /// For a tab: one of the tabs of the space's group it ends in, or none
    /// for no group. A split or a group stays as it is.
    group: Option<i32>,
}

pub fn handle(web_view: &WebView, window: &WindowRef, mt: MainThread) {
    // The address of the link under the pointer in a tab's page, or null;
    // "tab.status" says when it changes.
    let weak = window.clone();
    let _ = web_view.handle("tab.status", move |id: i32| {
        with_browser(&weak, |_, browser| Ok(link(tab(mt, browser, id)?)))
    });

    // A tab on an address, at the top of the list.
    let weak = window.clone();
    let _ = web_view.handle("tabs.open", move |url: String| {
        with_browser(&weak, |_, browser| {
            tabs::open(browser, &url).map_err(failed)?;
            let from = TabFrom::Sidebar;
            weak.state()?.analytics.record(Event::TabOpened { from });
            Ok(())
        })
    });

    // The active tab's address, on the clipboard.
    let weak = window.clone();
    let _ = web_view.handle("tabs.copyLink", move |()| {
        with_browser(&weak, |_, browser| {
            let tab = browser.active_tab().ok_or("There is no tab.")?;
            let off_the_record = clipboard::is_off_the_record(browser);
            clipboard::copy_link(&tab.url(), Some(tab.title()), off_the_record).map_err(failed)
        })
    });

    // The ID the tab's picture is served at now (`previewUrl`), or null for
    // none (tabs/previews.rs). If it has none, or it may be out of date, a
    // new one is taken, and "tabs.previewChanged" says so once it is.
    let weak = window.clone();
    let _ = web_view.handle("tabs.preview", move |id: i32| {
        with_browser(&weak, |_, browser| {
            let asking = weak.clone();
            let taken = move |preview: Option<String>| {
                let Some(preview) = preview else { return };
                let _ = with_window(&asking, |window| {
                    let changed = PreviewChanged { tab: id, preview };
                    let _ = window.page.web_view.send("tabs.previewChanged", &changed);
                    Ok(())
                });
            };
            Ok(tabs::previews::request(tab(mt, browser, id)?, taken))
        })
    });

    let weak = window.clone();
    let _ = web_view.handle("tabs.activate", move |id: i32| {
        with_browser(&weak, |_, browser| {
            tab(mt, browser, id)?.activate().map_err(failed)
        })
    });

    let weak = window.clone();
    let _ = web_view.handle("tabs.setMuted", move |set: SetMuted| {
        with_browser(&weak, |_, browser| {
            tab(mt, browser, set.id)?
                .set_muted(set.muted)
                .map_err(failed)
        })
    });

    let weak = window.clone();
    let _ = web_view.handle("tabs.close", move |id: i32| {
        with_browser(&weak, |_, browser| {
            let tab = tab(mt, browser, id)?;
            tabs::closes::close(browser, tab, TabFrom::Sidebar).map_err(failed)
        })
    });

    // The list's tabs closed but the active one, or the active one alone
    // (`tabs::clear`).
    let weak = window.clone();
    let _ = web_view.handle("tabs.clear", move |()| {
        with_browser(&weak, |_, browser| tabs::clear(browser).map_err(failed))
    });

    // A tab, or its split's or its group's, moved to an index in the list;
    // "browser.tabs" says where it landed.
    let weak = window.clone();
    let _ = web_view.handle("tabs.move", move |to: MoveTo| {
        with_browser(&weak, |_, browser| {
            let (Movable::Tab(id) | Movable::Split(id) | Movable::Group(id)) = to.unit;
            let tab = tab(mt, browser, id)?;
            let state = || tab.state().map_err(failed);
            match to.unit {
                Movable::Tab(_) => {
                    let group = group_of(mt, browser, to.group)?;
                    tabs::move_tab(mt, browser, tab, to.index, group)
                }
                Movable::Split(_) => {
                    let split = state()?.split.ok_or("The tab is in no split.")?;
                    tabs::move_split(browser, split, to.index)
                }
                Movable::Group(_) => {
                    let group = state()?.group.ok_or("The tab is in no group.")?;
                    tabs::move_group(browser, group, to.index)
                }
            }
            .map_err(failed)
        })
    });

    // A tab, or its split or its group, moved from the space it is in to
    // another of the window's, of the same profile: dropped on the space's
    // button, or on its list once the window has switched to it.
    let weak = window.clone();
    let _ = web_view.handle_call("tabs.moveToSpace", move |call| {
        let found = call
            .value::<MoveToSpace>()
            .map_err(|error| error.to_string());
        let found = found.and_then(|to| Ok((moving(mt, to.unit)?, to, weak.state()?)));
        let ((tab, moving), to, state) = match found {
            Ok(found) => found,
            Err(error) => {
                let _ = call.fail(&error);
                return;
            }
        };
        let (index, group) = (to.index, to.group);
        // Answered once they are there, for what the page does with them next.
        state.move_to_space(mt, weak.id, moving, to.space, index, move |moved| {
            // A tab leaves its group behind, and goes in the one it was
            // dropped in, if any.
            let placed = moved.and_then(|browser| match to.unit {
                Movable::Tab(_) => {
                    let group = group_of(mt, &browser, group)?;
                    tabs::move_tab(mt, &browser, tab, index, group).map_err(failed)
                }
                Movable::Split(_) | Movable::Group(_) => Ok(()),
            });
            let _ = match placed {
                Ok(()) => call.answer(&()),
                Err(error) => call.fail(&error),
            };
        });
    });

    // A web address or a file dropped on the list: a tab on it, where it was
    // dropped.
    let weak = window.clone();
    let _ = web_view.handle("tabs.openAt", move |at: OpenAt| {
        with_browser(&weak, |_, browser| {
            let group = group_of(mt, browser, at.group)?;
            tabs::open_at(mt, browser, &at.url, at.index, group).map_err(failed)?;
            let from = TabFrom::Drop;
            weak.state()?.analytics.record(Event::TabOpened { from });
            Ok(())
        })
    });

    // A tab dropped on the left or right half of another: the two in a
    // split.
    let weak = window.clone();
    let _ = web_view.handle("tabs.split", move |pair: Pair| {
        with_browser(&weak, |_, browser| {
            let first = tab(mt, browser, pair.first)?;
            tabs::split(first, tab(mt, browser, pair.second)?).map_err(failed)?;
            let from = SplitFrom::Tabs;
            weak.state()?.analytics.record(Event::SplitOpened { from });
            Ok(())
        })
    });

    // A tab's context menu, at the point the page names. Answers with what
    // was chosen, once the app has done it, or null.
    let weak = window.clone();
    let _ = web_view.handle_call("tabs.menu", move |call| {
        menu_call(&weak, call, |view, browser, at: MenuAt<i32>, done| {
            let tab = tab(mt, browser, at.id)?;
            let place = with_window(&weak, |found| Ok(found.place_of(browser)))?;
            let keeps = Keeps {
                favorites: place
                    .as_ref()
                    .is_some_and(|place| !place.is_off_the_record()),
                pins: place.as_ref().and_then(Place::space).is_some(),
            };
            let (weak, owner) = (weak.clone(), browser.clone());
            let done = move |chosen: Option<String>| {
                if let (Some(place), Ok(state)) = (&place, weak.state()) {
                    keep_chosen(&state, &owner, place, tab, chosen.as_deref());
                }
                done(chosen);
            };
            menus::show_tab_menu(mt, view, browser, tab, (at.x, at.y), keeps, done).map_err(failed)
        })
    });

    // Back, forward, reload and stop, in the active tab.
    for (name, run) in [
        ("tabs.back", BrowserTab::go_back as fn(BrowserTab) -> _),
        ("tabs.forward", BrowserTab::go_forward),
        ("tabs.reload", BrowserTab::reload),
        ("tabs.stop", BrowserTab::stop),
    ] {
        let weak = window.clone();
        let _ = web_view.handle(name, move |()| {
            with_browser(&weak, |_, browser| {
                let tab = browser.active_tab().ok_or("There is no tab.")?;
                run(tab).map_err(failed)
            })
        });
    }
}

/// Tells the page the link under the pointer in a tab's page changed.
pub fn send_status(window: &BrowserWindow, tab: BrowserTab) {
    let status = Status {
        tab: tab.id(),
        link: link(tab),
    };
    let _ = window.page.web_view.send("tab.status", &status);
}

// The address of the link Chrome's status bubble shows for a tab, if it
// shows one; not its loading line.
fn link(tab: BrowserTab) -> Option<String> {
    tab.state()
        .is_ok_and(|state| state.status == TabStatus::Link)
        .then(|| tab.status_text())
        .filter(|text| !text.is_empty())
}

// Pins `tab` as Pin Tab or Add to Favourites, chosen from its menu, would:
// first among the space's pins, or last among the favourites.
fn keep_chosen(
    state: &State,
    browser: &Browser,
    place: &Place,
    tab: BrowserTab,
    chosen: Option<&str>,
) {
    let (target, index) = match chosen {
        Some(PIN_TAB) => (PinTarget::Space { parent: None }, Some(0)),
        Some(ADD_FAVORITE) => (PinTarget::Favorites, None),
        _ => return,
    };
    if let Err(error) = pins::pin_tab(state, browser, place, tab, target, index) {
        eprintln!("Wren kept no pin: {error}");
    }
}

// The group of the tab the page names, if it names one: the group a tab is to
// be in.
pub(super) fn group_of(
    mt: MainThread,
    browser: &Browser,
    member: Option<i32>,
) -> Result<Option<TabGroup>, String> {
    let Some(member) = member else {
        return Ok(None);
    };
    let state = tab(mt, browser, member)?.state().map_err(failed)?;
    Ok(Some(state.group.ok_or("The tab is in no group.")?))
}

// The tab `unit` is named by, and the tabs that move with it: itself, its
// split's or its group's.
fn moving(mt: MainThread, unit: Movable) -> Result<(BrowserTab, Vec<BrowserTab>), String> {
    let (Movable::Tab(id) | Movable::Split(id) | Movable::Group(id)) = unit;
    let tab = BrowserTab::from_id(mt, id).ok_or("There is no such tab.")?;
    let browser = tab.browser().ok_or("There is no such tab.")?;
    let state = || tab.state().map_err(failed);
    let moving = match unit {
        Movable::Tab(_) => vec![tab],
        Movable::Split(_) => {
            let split = state()?.split.ok_or("The tab is in no split.")?;
            tabs::in_split(split).map_err(failed)?
        }
        Movable::Group(_) => {
            let group = state()?.group.ok_or("The tab is in no group.")?;
            tabs::in_group(&browser, group)
        }
    };
    Ok((tab, moving))
}

// The tab an ID from the page names, if it is the Browser's.
pub(super) fn tab(mt: MainThread, browser: &Browser, id: i32) -> Result<BrowserTab, String> {
    BrowserTab::from_id(mt, id)
        .filter(|tab| tab.browser().as_ref() == Some(browser))
        .ok_or_else(|| "There is no such tab.".into())
}
