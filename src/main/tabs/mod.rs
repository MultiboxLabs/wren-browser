// What the app does to a Browser's tabs, whether the page, the main menu or
// a context menu asks.
//
// The sidebar's list shows only the tabs Chromium has not pinned: a pinned
// tab is a pin's (pins/), drawn as the pin. So every index the list, its
// moves and its menu use is among those (`listed`), and is turned into the
// Browser's own only where a tab is put in place (`at_list`).

pub mod archive;
pub mod placeholder;
pub mod previews;

use std::time::{Duration, SystemTime, UNIX_EPOCH};

use wren::{Browser, BrowserTab, Error, MainThread, SplitLayout, TabGroup, TabSplit, TabState};

use crate::clipboard;
use crate::ipc::{self, OwnToast};
use crate::menus;

/// When `tab` was last on screen: what archiving counts from, and a pin's
/// last use (pins/). Now while it is shown; Chromium keeps it across
/// launches, so a tab left a long while ago counts from then.
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

/// The tabs the sidebar's list shows, in its order: those Chromium has not
/// pinned. The placeholder is among them, which the page hides itself.
pub fn listed(browser: &Browser) -> Vec<BrowserTab> {
    browser
        .tabs()
        .into_iter()
        .filter(|tab| !is_pinned(*tab))
        .collect()
}

/// The tabs Chromium has pinned, in its order: the pins' (pins/).
pub fn pinned(browser: &Browser) -> Vec<BrowserTab> {
    browser
        .tabs()
        .into_iter()
        .filter(|tab| is_pinned(*tab))
        .collect()
}

/// The split `tab` is in, if any.
pub fn split_of(tab: BrowserTab) -> Option<TabSplit> {
    tab.state().ok()?.split
}

/// Whether Chromium has pinned `tab`.
pub fn is_pinned(tab: BrowserTab) -> bool {
    tab.state().is_ok_and(|state| state.pinned)
}

// The Browser's index of `index` among the listed tabs: Chromium keeps its
// pinned tabs first.
fn at_list(browser: &Browser, index: usize) -> usize {
    let pinned = browser.tabs().into_iter().take_while(|tab| is_pinned(*tab));
    pinned.count() + index
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

/// Whether a tab can move up the list, and down: there is a run before it,
/// or after it.
pub fn can_move(browser: &Browser, tab: BrowserTab) -> (bool, bool) {
    runs(browser, tab).map_or((false, false), |(runs, mine)| {
        (mine > 0, mine + 1 < runs.len())
    })
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
        Some(split) => move_split(browser, split, to),
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

/// Moves a split's two tabs to `to`, the first's index among the listed
/// tabs, keeping the split.
pub fn move_split(browser: &Browser, split: TabSplit, to: usize) -> Result<(), Error> {
    split.move_to(at_list(browser, to))
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

/// The tabs of `group`, in their order.
pub fn in_group(browser: &Browser, group: TabGroup) -> Vec<BrowserTab> {
    browser
        .tabs()
        .into_iter()
        .filter(|tab| tab.state().is_ok_and(|state| state.group == Some(group)))
        .collect()
}
