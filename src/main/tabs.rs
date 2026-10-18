// What the app does to a Browser's tabs, whether the page, the main menu or
// a context menu asks.

use wren::{Browser, BrowserTab, Error, MainThread, SplitLayout, TabGroup, TabSplit};

use crate::ipc::{self, OwnToast};
use crate::menus;

/// A tab on `url`, at the top of the list, as the sidebar shows new tabs.
pub fn open(browser: &Browser, url: &str) -> Result<(), Error> {
    browser.add_tab(url, Some(0), true).map(drop)
}

/// Closes `tabs`. Chromium closes a Browser with its last tab, so the
/// window keeps one, on the New Tab page, when they are all it has.
pub fn close(browser: &Browser, tabs: &[BrowserTab]) -> Result<(), Error> {
    if browser.tabs().iter().all(|tab| tabs.contains(tab)) {
        browser.add_tab("", None, true)?;
    }
    for tab in tabs {
        tab.close()?;
    }
    Ok(())
}

/// The runs of tabs a tab moves among, as the sidebar draws them, and which
/// is the tab's: the tabs of a group together, then a split's two together,
/// and each other tab alone. A tab in a group moves among that group's.
fn runs(browser: &Browser, tab: BrowserTab) -> Result<(Vec<Vec<BrowserTab>>, usize), Error> {
    let group = tab.state()?.group;
    let scope = match group {
        Some(group) => in_group(browser, group),
        None => browser.tabs(),
    };
    let mut runs: Vec<Vec<BrowserTab>> = Vec::new();
    let mut last = None;
    for each in scope {
        let state = each.state()?;
        let in_group = if group.is_some() { None } else { state.group };
        let key = (
            in_group,
            if in_group.is_some() {
                None
            } else {
                state.split
            },
        );
        match runs.last_mut() {
            Some(run) if last == Some(key) && key != (None, None) => run.push(each),
            _ => runs.push(vec![each]),
        }
        last = Some(key);
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
    let all = browser.tabs();
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

/// A tab on `url`, shown, at `index` and in `group` (None: none). The page
/// puts what is dropped on it here, so only a web address is let through.
pub fn open_at(
    mt: MainThread,
    browser: &Browser,
    url: &str,
    index: usize,
    group: Option<TabGroup>,
) -> Result<(), Error> {
    if !(url.starts_with("https://") || url.starts_with("http://")) {
        return Err(Error::InvalidArgument);
    }
    let tab = browser.add_tab(url, Some(index), true)?;
    move_tab(mt, browser, tab, index, group)
}

/// Shows `first` and `second` side by side, in a split of their own. Chromium
/// puts them next to each other, in `first`'s group.
pub fn split(first: BrowserTab, second: BrowserTab) -> Result<(), Error> {
    first.split_with(second, SplitLayout::SideBySide).map(drop)
}

/// Moves a tab to `to` in the list, into `group` (None: out of any). Joining
/// a group puts the tab at the group's nearer end and leaving puts it out
/// past that end, and the move then keeps the group, as the tab lands next
/// to one of its tabs, or, leaving, next to none.
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
    move_run(browser, &[tab], to)
}

/// Moves a split's two tabs to `to`, the first's index. Chromium ends a split
/// whose tab is moved alone, so it is made again from the same tabs, with
/// the same layout and ratio.
pub fn move_split(browser: &Browser, split: TabSplit, to: usize) -> Result<(), Error> {
    let state = split.state()?;
    let (Some(first), Some(second)) = (state.first, state.second) else {
        return Ok(());
    };
    // In the list's order, which is not always the split's.
    let mut run = [first, second];
    run.sort_by_key(|tab| tab.index());
    split.unsplit()?;
    let moved = move_run(browser, &run, to);
    let joined = first
        .split_with(second, state.layout)
        .and_then(|split| split.set_ratio(state.ratio, false));
    moved.and(joined)
}

/// Moves a group's tabs to `to`, the first's index. Chromium keeps a group's
/// tabs where they are, so they are taken out of it and put in a new group
/// with the old one's title, colour and fold.
pub fn move_group(
    mt: MainThread,
    browser: &Browser,
    group: TabGroup,
    to: usize,
) -> Result<(), Error> {
    let (title, (color, collapsed)) = (group.title(), group.visuals()?);
    let run = in_group(browser, group);
    BrowserTab::ungroup(mt, &run)?;
    let moved = move_run(browser, &run, to);
    let regrouped =
        BrowserTab::group(mt, &run).and_then(|group| group.set_visuals(&title, color, collapsed));
    moved.and(regrouped)
}

/// Moves tabs that are together, in order, so the first is at `to`. Each goes
/// straight to its place, the last first when they move down the list, so no
/// tab stops between the tabs of a group it is not to join.
fn move_run(browser: &Browser, run: &[BrowserTab], to: usize) -> Result<(), Error> {
    let all = browser.tabs();
    let Some(from) = run
        .first()
        .and_then(|first| all.iter().position(|tab| tab == first))
    else {
        return Ok(());
    };
    let to = to.min(all.len().saturating_sub(run.len()));
    if to > from {
        for (offset, tab) in run.iter().enumerate().rev() {
            tab.move_to(to + offset)?;
        }
    } else if to < from {
        for (offset, tab) in run.iter().enumerate() {
            tab.move_to(to + offset)?;
        }
    }
    Ok(())
}

/// Puts the active tab's address on the clipboard, and says so in a toast.
/// Chromium's New Tab page has none to copy (as `isNewTab` in
/// pages/ui/address.ts).
pub fn copy_url(browser: &Browser) -> Result<(), Error> {
    let Some(url) = browser.active_tab().map(|tab| tab.url()) else {
        return Ok(());
    };
    if url.is_empty() || url.starts_with("chrome://newtab") {
        return Ok(());
    }
    menus::copy(&url);
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
