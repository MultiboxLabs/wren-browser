// What the app does to a Browser's tabs, whether the page, the main menu or
// a context menu asks.
//
// What each tab is, a tab of the sidebar's list, a pin's or the placeholder,
// is its role (roles.rs). The list shows the tabs whose role is to be
// listed. So every index the list, its moves and its menu use is among
// those (`listed`), and is turned into the Browser's own only where a tab
// is put in place (`at_list`).
//
// Tabs brought from another Browser move there if it is of their profile,
// and close and are made again if it is of another (recreate.rs).

pub mod archive;
pub mod closes;
pub mod placeholder;
pub mod previews;
mod recreate;
pub mod roles;

use std::time::{Duration, SystemTime, UNIX_EPOCH};

use std::rc::Rc;

use wren::{
    Browser, BrowserTab, BrowserType, Change, ChangeKind, Error, MainThread, SplitLayout,
    TabFields, TabGroup, TabSplit, TabState,
};

use crate::analytics::{Crash, Event};
use crate::app::State;
use crate::clipboard;
use crate::ipc::{self, OwnToast};
use crate::menus;
use crate::pins;
use crate::sidebar::items;

/// What follows a change to `browser`'s tabs, to one of them, or to a split
/// (`change`). A placeholder goes, or stays, as the tabs change, and the
/// pins' links follow them. A tab left for another has its picture taken,
/// and one whose page changes has it go stale. The page is told of the tabs
/// when a pin settled.
pub fn changed(state: &Rc<State>, browser: &Browser, change: &Change) {
    closes::settle(&state.analytics);
    roles::forget_closed();
    items::carry::forget_gone();
    placeholder::settle(browser);
    previews::follow_active(browser);
    if let Some(tab) = change.tab
        && change
            .tab_fields
            .intersects(TabFields::URL | TabFields::LOADING)
    {
        previews::page_changed(tab);
    }
    if pins::settle(state, browser, change)
        && let Some(window) = state.windows.of(browser)
    {
        ipc::send_tabs(&window, browser);
    }
}

/// Counts a tab whose page has just crashed, if `change` says one did.
pub fn record_crash(state: &State, change: &Change) {
    if change.kind != ChangeKind::Tab || !change.tab_fields.contains(TabFields::CRASHED) {
        return;
    }
    let crash = change
        .tab
        .and_then(|tab| tab.state().ok())
        .map(|tab| tab.crash);
    if let Some(reason) = crash.and_then(Crash::of) {
        state.analytics.record(Event::TabCrashed { reason });
    }
}

/// When `tab` was last in use: what archiving counts from, and a pin's last
/// use (pins/). Now while it is shown or its Browser's active tab, even in a
/// window not on screen; Chromium keeps it across launches, so a tab left a
/// long while ago counts from then.
pub fn last_active(tab: BrowserTab) -> SystemTime {
    tab.state()
        .map_or_else(|_| SystemTime::now(), |state| last_active_in(&state))
}

/// `last_active`, from a tab's state already read.
pub fn last_active_in(state: &TabState) -> SystemTime {
    u64::try_from(state.last_active_ms)
        .ok()
        .filter(|ms| *ms > 0)
        .map_or_else(SystemTime::now, |ms| UNIX_EPOCH + Duration::from_millis(ms))
}

/// A tab on `url`, at the top of the list, as the sidebar shows new tabs.
pub fn open(browser: &Browser, url: &str) -> Result<(), Error> {
    browser
        .add_tab(url, Some(at_list(browser, 0)), true)
        .map(drop)
}

/// The tabs the sidebar's list shows, in its order: those whose role is to
/// be listed (roles.rs), which a pin's tab and the placeholder are not.
pub fn listed(browser: &Browser) -> Vec<BrowserTab> {
    browser
        .tabs()
        .into_iter()
        .filter(|tab| roles::is_listed(*tab))
        .collect()
}

/// The split `tab` is in, if any.
pub fn split_of(tab: BrowserTab) -> Option<TabSplit> {
    tab.state().ok()?.split
}

/// `tab`, and the other of its split if it is in one, in their order: the
/// tabs of its row.
pub fn with_split(tab: BrowserTab) -> Vec<BrowserTab> {
    split_of(tab)
        .and_then(|split| in_split(split).ok())
        .unwrap_or_else(|| vec![tab])
}

/// Copies `tab`'s row after it, in the background: the tab, or both tabs of
/// its split, joined in a split of their own with its layout and ratio.
pub fn duplicate(tab: BrowserTab) -> Result<(), Error> {
    let Some(split) = split_of(tab) else {
        return tab.duplicate(false).map(drop);
    };
    let state = split.state()?;
    let (Some(first), Some(second)) = (state.first, state.second) else {
        return Err(Error::TabUnavailable);
    };
    // Chromium puts the copy of a split's first tab between its two, and
    // ends the split, but the copy of its second tab after it. So the
    // second is copied, then the first as the second, with the sides
    // swapped while it is, which leaves the copies in order after the split.
    let second_copy = second.duplicate(false)?;
    split.swap_tabs()?;
    let first_copy = first.duplicate(false);
    split.swap_tabs()?;
    let copy = first_copy?.split_with(second_copy, state.layout)?;
    copy.set_ratio(state.ratio, false)
}

/// Whether closing `tab` may show its page's "Leave site?" prompt, where the
/// user can keep the tab. Otherwise a tab asked to close does close.
pub fn may_ask_before_close(tab: BrowserTab) -> bool {
    tab.state().is_ok_and(|state| state.may_ask_before_close)
}

// The Browser's index of `index` among the listed tabs: where the listed
// tab there is now, or past the last of them. With none listed, it is past
// the tabs Chromium has pinned, which it keeps first.
fn at_list(browser: &Browser, index: usize) -> usize {
    let tabs = browser.tabs();
    let mut places = (0..tabs.len()).filter(|at| roles::is_listed(tabs[*at]));
    if let Some(at) = places.nth(index) {
        return at;
    }
    let last = (0..tabs.len()).rfind(|at| roles::is_listed(tabs[*at]));
    last.map_or_else(
        || {
            let pinned = |tab: &&BrowserTab| tab.state().is_ok_and(|state| state.pinned);
            tabs.iter().take_while(pinned).count()
        },
        |last| last + 1,
    )
}

/// Whether `url` is Chromium's New Tab page, or none yet.
pub fn is_new_tab(url: &str) -> bool {
    url.is_empty() || url.starts_with("chrome://newtab")
}

/// Closes `tabs`. When they are all the Browser has, a placeholder stands
/// in for them, and the Browser stays (`placeholder`).
pub fn close(browser: &Browser, tabs: &[BrowserTab]) -> Result<(), Error> {
    placeholder::stand_in(browser, tabs)?;
    for tab in tabs {
        tab.close()?;
    }
    Ok(())
}

/// Clears the list: closes its tabs but the active one, or the active one
/// when it is the only one. The placeholder stays, and so do the pins'
/// tabs, as neither is the list's.
pub fn clear(browser: &Browser) -> Result<(), Error> {
    let active = browser.active_tab();
    let tabs = listed(browser);
    let others: Vec<_> = tabs
        .iter()
        .copied()
        .filter(|tab| Some(*tab) != active)
        .collect();
    close(browser, if others.is_empty() { &tabs } else { &others })
}

/// What keeps tabs together in the sidebar's list: a group's, or a split's.
#[derive(Clone, Copy, PartialEq)]
enum Together {
    Group(TabGroup),
    Split(TabSplit),
}

/// The runs of tabs a tab moves among, as the sidebar draws them, and which
/// is the tab's: the tabs of a group together, then a split's two together,
/// and each other tab alone. A tab in a group moves among that group's.
fn runs(browser: &Browser, tab: BrowserTab) -> Result<(Vec<Vec<BrowserTab>>, usize), Error> {
    let group = tab.state()?.group;
    let among = match group {
        Some(group) => in_group(browser, group),
        None => listed(browser),
    };
    let mut runs: Vec<Vec<BrowserTab>> = Vec::new();
    let mut last = None;
    for each in among {
        let state = each.state()?;
        // Within a group, its tabs are not together as a group's.
        let together = match (group, state.group, state.split) {
            (None, Some(group), _) => Some(Together::Group(group)),
            (_, _, Some(split)) => Some(Together::Split(split)),
            _ => None,
        };
        match runs.last_mut() {
            Some(run) if together.is_some() && together == last => run.push(each),
            _ => runs.push(vec![each]),
        }
        last = together;
    }
    let mine = runs.iter().position(|run| run.contains(&tab)).unwrap_or(0);
    Ok((runs, mine))
}

/// Moves a tab one place up the list (`by` -1) or down (1), past a tab, a
/// split or a whole group, as dragging it there would. Its split goes with it.
pub fn move_by(mt: MainThread, browser: &Browser, tab: BrowserTab, by: isize) -> Result<(), Error> {
    let (runs, mine) = runs(browser, tab)?;
    let Some(next) = mine
        .checked_add_signed(by)
        .filter(|next| *next < runs.len())
    else {
        return Ok(());
    };
    let all = listed(browser);
    let start = |run: &[BrowserTab]| all.iter().position(|each| *each == run[0]).unwrap_or(0);
    // Down, it lands past the run, which the tabs of its own then leave.
    let to = if by < 0 {
        start(&runs[next])
    } else {
        start(&runs[next]) + runs[next].len() - runs[mine].len()
    };
    let state = tab.state()?;
    match state.split {
        Some(split) => move_split(mt, browser, split, to, state.group),
        None => move_tab(mt, browser, tab, to, state.group),
    }
}

/// Whether an address dropped on the sidebar may open: only a web address
/// or a file's is let through.
pub fn is_droppable(url: &str) -> bool {
    ["https://", "http://", "file://"]
        .iter()
        .any(|scheme| url.starts_with(scheme))
}

/// A tab on `url`, shown, at `index` of the list and in `group` (None:
/// none). The page puts what is dropped on it here (`is_droppable`).
pub fn open_at(
    mt: MainThread,
    browser: &Browser,
    url: &str,
    index: usize,
    group: Option<TabGroup>,
) -> Result<(), Error> {
    if !is_droppable(url) {
        return Err(Error::InvalidArgument);
    }
    add_at(mt, browser, url, index, group, true).map(drop)
}

/// A tab on `url` at `index` of the list and in `group` (None: none),
/// shown if `activate`.
pub fn add_at(
    mt: MainThread,
    browser: &Browser,
    url: &str,
    index: usize,
    group: Option<TabGroup>,
    activate: bool,
) -> Result<BrowserTab, Error> {
    let tab = browser.add_tab(url, Some(at_list(browser, index)), activate)?;
    move_tab(mt, browser, tab, index, group)?;
    Ok(tab)
}

/// Shows `first` and `second` side by side, in a split of their own. Chromium
/// puts them next to each other, in `first`'s group.
pub fn split(first: BrowserTab, second: BrowserTab) -> Result<(), Error> {
    first.split_with(second, SplitLayout::SideBySide).map(drop)
}

/// Moves a tab to `to` among the listed tabs, into `group` (None: out of
/// any). Joining a group puts the tab at the group's nearer end and leaving
/// puts it out past that end, and the move then keeps the group, as the tab
/// lands next to one of its tabs, or, leaving, next to none.
pub fn move_tab(
    mt: MainThread,
    browser: &Browser,
    tab: BrowserTab,
    to: usize,
    group: Option<TabGroup>,
) -> Result<(), Error> {
    if tab.state()?.group != group {
        match group {
            Some(group) => group.add(&[tab])?,
            None => BrowserTab::ungroup(mt, &[tab])?,
        }
    }
    move_alone(browser, tab, to)
}

/// Brings `moving`, tabs of one other Browser, to `to` among `browser`'s
/// listed tabs, the first of them shown there, then calls `done` with them
/// as they are in `browser`, in the order of `moving`. They move at once if
/// `browser` is of their profile: a normal Browser's keep their IDs
/// (`move_in`), and a popup's tab becomes a new one, its page not loaded
/// again, as its popup closes. If `browser` is of another profile, they
/// close and are made again there once they have gone
/// (`recreate::recreate_in`), and a page that keeps its tab keeps them all
/// where they are, with `Error::Cancelled`.
pub fn bring_in(
    mt: MainThread,
    browser: &Browser,
    moving: &[BrowserTab],
    to: usize,
    done: impl FnOnce(Result<Vec<BrowserTab>, Error>) + 'static,
) {
    let Some(from) = moving.first().and_then(|tab| tab.browser()) else {
        return done(Err(Error::TabUnavailable));
    };
    if crosses_profile(&from, browser) {
        return recreate::recreate_in(mt, browser, moving, to, done);
    }
    done(match from.browser_type() {
        BrowserType::Normal => move_in(browser, moving, to).map(|()| moving.to_vec()),
        BrowserType::Popup | BrowserType::AppPopup => moving
            .iter()
            .map(|tab| browser.move_popup_tab(*tab, Some(at_list(browser, to)), true))
            .collect(),
        _ => Err(Error::NotAllowed),
    });
}

/// Whether tabs brought from `from` to `to` go to another profile, or to
/// the other side of their own, and so are made again (`bring_in`).
pub fn crosses_profile(from: &Browser, to: &Browser) -> bool {
    let profile_of = |browser: &Browser| {
        let profile = browser.profile()?;
        Some((profile.id(), profile.kind()))
    };
    profile_of(from) != profile_of(to)
}

/// Moves `moving`, tabs of another Browser of the same profile, to `to`
/// among `browser`'s listed tabs, the first of them shown there. A split or
/// a group that moves whole stays one. When they are all their Browser has,
/// a placeholder stands in for them, and that Browser stays (`placeholder`).
pub fn move_in(browser: &Browser, moving: &[BrowserTab], to: usize) -> Result<(), Error> {
    let Some(from) = moving.first().and_then(|tab| tab.browser()) else {
        return Err(Error::TabUnavailable);
    };
    placeholder::stand_in(&from, moving)?;
    browser.move_tabs(moving, Some(at_list(browser, to)), true)
}

/// Moves `moving`, a pin's tabs in another Browser of the same profile, to
/// `browser`, the first of them shown there if `activate`. They are pinned,
/// so Chromium puts them among the pinned tabs, and a split stays one. When
/// they are all their Browser has, a placeholder stands in for them, as
/// `move_in` does.
pub fn move_here(browser: &Browser, moving: &[BrowserTab], activate: bool) -> Result<(), Error> {
    let Some(from) = moving.first().and_then(|tab| tab.browser()) else {
        return Err(Error::TabUnavailable);
    };
    placeholder::stand_in(&from, moving)?;
    browser.move_tabs(moving, None, activate)
}

/// The tabs of `split`, in their order.
pub fn in_split(split: TabSplit) -> Result<Vec<BrowserTab>, Error> {
    let state = split.state()?;
    Ok([state.first, state.second].into_iter().flatten().collect())
}

/// Moves a split's two tabs to `to`, the first's index among the listed
/// tabs, into `group` (None: out of any), keeping the split. The move
/// leaves the split's group to Chromium, which at a group's edge keeps the
/// split in its own group or out of any, so the group is set after it.
/// Both tabs join or leave together: Chromium keeps a split whose two tabs
/// are grouped in one call, and ends one whose tabs are grouped apart.
pub fn move_split(
    mt: MainThread,
    browser: &Browser,
    split: TabSplit,
    to: usize,
    group: Option<TabGroup>,
) -> Result<(), Error> {
    split.move_to(at_list(browser, to))?;
    let both = in_split(split)?;
    let Some(first) = both.first() else {
        return Ok(());
    };
    if first.state()?.group != group {
        match group {
            Some(group) => group.add(&both)?,
            None => BrowserTab::ungroup(mt, &both)?,
        }
    }
    Ok(())
}

/// Puts `tabs` in a new group, which is named "Group 1", "Group 2" and so on
/// and takes the colour the Browser's groups use least, so it is never left
/// untitled and grey.
pub fn new_group(
    mt: MainThread,
    browser: &Browser,
    tabs: &[BrowserTab],
) -> Result<TabGroup, Error> {
    let groups: Vec<_> = browser
        .tabs()
        .into_iter()
        .filter_map(|tab| tab.state().ok()?.group)
        .collect();
    let used: Vec<_> = groups
        .iter()
        .filter_map(|group| Some(group.visuals().ok()?.0))
        .collect();
    let titles: Vec<_> = groups.iter().map(|group| group.title()).collect();
    // The lowest number no group has taken.
    let number = (1..)
        .find(|number| !titles.contains(&format!("Group {number}")))
        .unwrap_or(1);
    let group = BrowserTab::group(mt, tabs)?;
    group.set_visuals(
        &format!("Group {number}"),
        menus::least_used_color(&used),
        false,
    )?;
    Ok(group)
}

/// Moves a group's tabs to `to`, the first's index among the listed tabs,
/// keeping the group.
pub fn move_group(browser: &Browser, group: TabGroup, to: usize) -> Result<(), Error> {
    group.move_to(at_list(browser, to))
}

// Moves `tab` so it is at `to` among the listed tabs.
fn move_alone(browser: &Browser, tab: BrowserTab, to: usize) -> Result<(), Error> {
    let last = listed(browser).len().saturating_sub(1);
    tab.move_to(at_list(browser, to.min(last)))
}

/// Puts the active tab's address on the clipboard, and says so in a toast.
/// Chromium's New Tab page has none to copy (as `isNewTab` in
/// pages/ui/address.ts).
pub fn copy_url(browser: &Browser) -> Result<(), Error> {
    let Some(tab) = browser.active_tab() else {
        return Ok(());
    };
    let url = tab.url();
    if is_new_tab(&url) {
        return Ok(());
    }
    let off_the_record = clipboard::is_off_the_record(browser);
    clipboard::copy_link(&url, Some(tab.title()), off_the_record)?;
    ipc::show_toast(browser, OwnToast::UrlCopied)
}

/// The group an ID from a page names, if it is `browser`'s.
pub fn group(mt: MainThread, browser: &Browser, id: &str) -> Option<TabGroup> {
    TabGroup::parse(mt, id).filter(|group| group.browser().as_ref() == Some(browser))
}

/// The tabs of `group`, in their order.
pub fn in_group(browser: &Browser, group: TabGroup) -> Vec<BrowserTab> {
    browser
        .tabs()
        .into_iter()
        .filter(|tab| tab.state().is_ok_and(|state| state.group == Some(group)))
        .collect()
}
