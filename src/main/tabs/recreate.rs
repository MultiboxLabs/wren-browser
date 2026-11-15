// Tabs that go to another profile. A tab keeps its page, its history and
// its ID only among its own profile's Browsers (`move_in`), and Wren Runtime
// can carry it no further. So in another profile it is made again: the tab
// closes, and once it has gone, a new tab opens on its address, in a split
// and a group like those it left. A page that asks before it closes can
// keep its tab, and then nothing is made. Its back and forward history,
// what was typed in its page and its sign-ins stay with the profile it
// left.

use wren::{
    Browser, BrowserTab, BrowserType, Error, MainThread, SplitLayout, TabGroupColor, TabSplit,
    TabState,
};

use super::{at_list, in_group, is_new_tab, placeholder};

/// Closes `moving`, tabs of one Browser of a profile not `browser`'s, all
/// or none, then makes them again at `to` among `browser`'s listed tabs
/// and calls `done` with the new tabs, in the order of `moving`. A split
/// that comes whole is one again, with its layout and ratio, and so is a
/// group, with its title, colour and whether it is collapsed. Their
/// Browser's active tab, if it comes, or else the first, is shown. If a
/// page keeps its tab, every tab stays and `done` gets `Error::Cancelled`.
/// If a tab cannot be made once they have closed, those made already close
/// too, and Reopen Closed Tab can bring the old ones back.
pub fn recreate_in(
    mt: MainThread,
    browser: &Browser,
    moving: &[BrowserTab],
    to: usize,
    done: impl FnOnce(Result<Vec<BrowserTab>, Error>) + 'static,
) {
    let read = (|| {
        let from = moving.first().and_then(|tab| tab.browser());
        let from = from.ok_or(Error::TabUnavailable)?;
        let shape = Shape::read(&from, moving)?;
        // A popup closes with its tab, as it should.
        if from.browser_type() == BrowserType::Normal {
            placeholder::stand_in_behind(&from, moving)?;
        }
        Ok(shape)
    })();
    let shape = match read {
        Ok(shape) => shape,
        Err(error) => return done(Err(error)),
    };
    let browser = browser.clone();
    BrowserTab::close_all(moving, move |result| {
        done(result.and_then(|()| shape.make(mt, &browser, to)));
    });
}

// What the tabs that are made again are, read before they close: each
// one's address, which of them is shown, and the splits and groups they
// make, by their indices among them.
struct Shape {
    urls: Vec<String>,
    shown: usize,
    splits: Vec<Split>,
    groups: Vec<Group>,
}

struct Split {
    first: usize,
    second: usize,
    layout: SplitLayout,
    ratio: f64,
}

struct Group {
    tabs: Vec<usize>,
    title: String,
    color: TabGroupColor,
    collapsed: bool,
}

impl Shape {
    // Reads `moving`, tabs of `from`: a split only if both its tabs are
    // among them, and a group only if all its tabs are.
    fn read(from: &Browser, moving: &[BrowserTab]) -> Result<Shape, Error> {
        let states = moving
            .iter()
            .map(|tab| tab.state())
            .collect::<Result<Vec<TabState>, _>>()?;
        let index_of = |tab: Option<BrowserTab>| moving.iter().position(|each| Some(*each) == tab);
        let active = from.active_tab();
        let mut splits = Vec::new();
        for split in distinct(states.iter().map(|state| state.split)) {
            splits.extend(read_split(split, index_of)?);
        }
        let mut groups = Vec::new();
        for group in distinct(states.iter().map(|state| state.group)) {
            let tabs: Option<Vec<_>> = in_group(from, group)
                .into_iter()
                .map(|tab| index_of(Some(tab)))
                .collect();
            let Some(tabs) = tabs else { continue };
            let (color, collapsed) = group.visuals()?;
            groups.push(Group {
                tabs,
                title: group.title(),
                color,
                collapsed,
            });
        }
        Ok(Shape {
            urls: moving.iter().map(|tab| tab.url()).collect(),
            shown: index_of(active).unwrap_or(0),
            splits,
            groups,
        })
    }

    // Makes the tabs in `browser`, one after another from `to`, then joins
    // them. Splits first, as a split whose two tabs join a group in one
    // call stays one. If any of it fails, the tabs made close.
    fn make(&self, mt: MainThread, browser: &Browser, to: usize) -> Result<Vec<BrowserTab>, Error> {
        let at = at_list(browser, to);
        let mut made = Vec::with_capacity(self.urls.len());
        let built = (|| {
            for (index, url) in self.urls.iter().enumerate() {
                // Chromium's New Tab page is made by asking for none.
                let url = if is_new_tab(url) { "" } else { url.as_str() };
                made.push(browser.add_tab(url, Some(at + index), index == self.shown)?);
            }
            for split in &self.splits {
                let joined = made[split.first].split_with(made[split.second], split.layout)?;
                joined.set_ratio(split.ratio, false)?;
            }
            for group in &self.groups {
                let tabs: Vec<_> = group.tabs.iter().map(|index| made[*index]).collect();
                let joined = BrowserTab::group(mt, &tabs)?;
                joined.set_visuals(&group.title, group.color, group.collapsed)?;
            }
            Ok(())
        })();
        if let Err(error) = built {
            for tab in &made {
                let _ = tab.close_without_asking();
            }
            return Err(error);
        }
        Ok(made)
    }
}

// `split` by the indices of its two tabs, if both are among those read.
fn read_split(
    split: TabSplit,
    index_of: impl Fn(Option<BrowserTab>) -> Option<usize>,
) -> Result<Option<Split>, Error> {
    let state = split.state()?;
    let (Some(first), Some(second)) = (index_of(state.first), index_of(state.second)) else {
        return Ok(None);
    };
    Ok(Some(Split {
        first,
        second,
        layout: state.layout,
        ratio: state.ratio,
    }))
}

// Each of `items` that is some, once, in the order they first come.
fn distinct<T: PartialEq>(items: impl Iterator<Item = Option<T>>) -> Vec<T> {
    let mut seen = Vec::new();
    for item in items.flatten() {
        if !seen.contains(&item) {
            seen.push(item);
        }
    }
    seen
}
