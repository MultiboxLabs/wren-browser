// The colours a tab group may have, and its name in a menu. A group's menu
// is built with every item's (item.rs).

use wren::{Error, MenuItem, TabGroup, TabGroupColor};

/// The items of a group's Colour menu, its own checked: each one's ID is
/// `prefix` and the colour's name.
pub(super) fn color_items(group: TabGroup, prefix: &str) -> Result<Vec<MenuItem>, String> {
    let (current, _) = group.visuals().map_err(|error| format!("{error:?}"))?;
    Ok(COLORS
        .iter()
        .map(|&color| MenuItem::Item {
            id: format!("{prefix}{}", color_name(color)),
            label: color_label(color).into(),
            enabled: true,
            checked: color == current,
            hidden: false,
            key: None,
        })
        .collect())
}

/// Gives a group the colour of a name (`color_name`); an unknown name
/// changes nothing.
pub fn set_group_color(group: TabGroup, name: &str) -> Result<(), Error> {
    let Some(&color) = COLORS.iter().find(|&&color| color_name(color) == name) else {
        return Ok(());
    };
    let (_, collapsed) = group.visuals()?;
    group.set_visuals(&group.title(), color, collapsed)
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
