// What the app does to a tab group: collapsing and renaming it, its
// colours, and its name where a menu lists it. The Colour menu
// itself is built with the rest of a group's menu (menus/item.rs).

use wren::{Error, TabGroup, TabGroupColor};

/// Gives a group the colour of a name (`color_name`); an unknown name
/// changes nothing.
pub fn set_color(group: TabGroup, name: &str) -> Result<(), Error> {
    let Some(&color) = COLORS.iter().find(|&&color| color_name(color) == name) else {
        return Ok(());
    };
    let (_, collapsed) = group.visuals()?;
    group.set_visuals(&group.title(), color, collapsed)
}

/// Collapses an open group, or opens a collapsed one.
pub fn toggle(group: TabGroup) -> Result<(), Error> {
    let (color, collapsed) = group.visuals()?;
    group.set_visuals(&group.title(), color, !collapsed)
}

/// Gives a group `title` as its name, without the spaces round it.
pub fn rename(group: TabGroup, title: &str) -> Result<(), Error> {
    let (color, collapsed) = group.visuals()?;
    group.set_visuals(title.trim(), color, collapsed)
}

/// The colours a group may have, in the order its Colour menu lists them.
pub const COLORS: [TabGroupColor; 9] = [
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

/// A group colour's name, as a menu shows it.
pub fn color_label(color: TabGroupColor) -> &'static str {
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

/// A group's title, or its colour for an untitled one.
pub fn name(group: TabGroup) -> String {
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
