// A tab group's menu, in the sidebar, and the colours a group may have.

use wren::{Browser, BrowserTab, Error, MainThread, MenuItem, NativeView, TabGroup, TabGroupColor};

use crate::tabs;

/// Shows a group's menu, as `show_tab_menu` does a tab's. "rename" is left
/// to the page, which has the field.
pub fn show_group_menu(
    mt: MainThread,
    view: NativeView,
    browser: &Browser,
    group: TabGroup,
    point: (f64, f64),
    done: impl FnOnce(Option<String>) + 'static,
) -> Result<(), Error> {
    let (current, _) = group.visuals()?;
    let colors = COLORS
        .iter()
        .map(|&color| MenuItem::Item {
            id: format!("color:{}", color_name(color)),
            label: color_label(color).into(),
            enabled: true,
            checked: color == current,
            key: None,
        })
        .collect();
    let items = [
        MenuItem::item("new-tab", "New Tab in Group"),
        MenuItem::item("rename", "Rename Group…"),
        MenuItem::submenu("Color", colors),
        MenuItem::Separator,
        MenuItem::item("ungroup", "Ungroup"),
        MenuItem::item("close", "Close Group"),
    ];
    let browser = browser.clone();
    mt.show_context_menu(&items, view, point, move |chosen| {
        let members = tabs::in_group(&browser, group);
        let _ = match chosen.as_deref() {
            Some("new-tab") => {
                let after = members
                    .last()
                    .and_then(|tab| tab.index())
                    .map(|index| index + 1);
                browser
                    .add_tab("", after, true)
                    .and_then(|tab| group.add(&[tab]))
            }
            Some(id) if id.starts_with("color:") => {
                match COLORS.iter().find(|&&color| color_name(color) == &id[6..]) {
                    Some(&color) => group.visuals().and_then(|(_, collapsed)| {
                        group.set_visuals(&group.title(), color, collapsed)
                    }),
                    None => Ok(()),
                }
            }
            Some("ungroup") => BrowserTab::ungroup(mt, &members),
            Some("close") => tabs::close(&browser, &members),
            _ => Ok(()),
        };
        done(chosen);
    })
}

const COLORS: [TabGroupColor; 9] = [
    TabGroupColor::Grey,
    TabGroupColor::Blue,
    TabGroupColor::Red,
    TabGroupColor::Yellow,
    TabGroupColor::Green,
    TabGroupColor::Pink,
    TabGroupColor::Purple,
    TabGroupColor::Cyan,
    TabGroupColor::Orange,
];

/// The colour fewest of `used` have, the first of the menu's on a tie: what a
/// new group takes, so that groups next to each other are told apart.
pub fn least_used_color(used: &[TabGroupColor]) -> TabGroupColor {
    COLORS
        .into_iter()
        .min_by_key(|color| used.iter().filter(|used| *used == color).count())
        .unwrap_or(TabGroupColor::Grey)
}

/// A group colour's name, for the page, which has a colour for each.
pub fn color_name(color: TabGroupColor) -> &'static str {
    match color {
        TabGroupColor::Grey => "grey",
        TabGroupColor::Blue => "blue",
        TabGroupColor::Red => "red",
        TabGroupColor::Yellow => "yellow",
        TabGroupColor::Green => "green",
        TabGroupColor::Pink => "pink",
        TabGroupColor::Purple => "purple",
        TabGroupColor::Cyan => "cyan",
        TabGroupColor::Orange => "orange",
    }
}

fn color_label(color: TabGroupColor) -> &'static str {
    match color {
        TabGroupColor::Grey => "Grey",
        TabGroupColor::Blue => "Blue",
        TabGroupColor::Red => "Red",
        TabGroupColor::Yellow => "Yellow",
        TabGroupColor::Green => "Green",
        TabGroupColor::Pink => "Pink",
        TabGroupColor::Purple => "Purple",
        TabGroupColor::Cyan => "Cyan",
        TabGroupColor::Orange => "Orange",
    }
}

// A group's title, or its colour for an untitled one.
pub(super) fn group_name(group: TabGroup) -> String {
    match group.title() {
        title if !title.is_empty() => title,
        _ => {
            let color = group
                .visuals()
                .map_or(TabGroupColor::Grey, |(color, _)| color);
            format!("{} Group", color_label(color))
        }
    }
}
