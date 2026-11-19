// The sidebar in a profile's `tabs.db`, decrypted (sqlcipher.rs), as far as
// bringing it over goes. `nodes` is a tree, each node of a `kind` naming a
// row of the table for it (`entity_id`), in `order` under its parent, and
// gone once it has a `deleted_at`. At its root is each space's
// `pinned_container`, its pinned tabs; a `window` for each window open on
// the space, the tabs below them in its sidebar; and the profile's
// `favorites`, which every space shows. Both a space's pinned tabs and its
// sidebar's come over as its pins, in that order. Each holds `tab`s and
// `group`s (folders). A tab holds a `content_pane` for each of its pages,
// two for a split, whose page is in `web_contents`. A space has a title and
// a colour by name, but no icon.

use std::collections::{HashMap, HashSet};

use rusqlite::Connection;

use crate::import::data::{
    Look, Pin, PinPage, Space, SpaceIcon, Spaces, UNNAMED_FOLDER, UNNAMED_SPACE, is_page, name_or,
    pruned, split_ratio,
};
use crate::import::source::ReadError;

/// The colour of each of its themes, which it names but keeps no value for:
/// macOS's colour of that name, in the light appearance, in sRGB. Its
/// `neutral` has no colour, and comes over blank.
const COLOURS: &[(&str, [u8; 3])] = &[
    ("red", [255, 59, 48]),
    ("orange", [255, 149, 0]),
    ("yellow", [255, 204, 0]),
    ("green", [40, 205, 65]),
    ("blue", [0, 122, 255]),
    ("purple", [175, 82, 222]),
    ("pink", [255, 45, 85]),
];

struct Node {
    id: i64,
    kind: String,
    entity: String,
    space: String,
}

/// The tree, with what its nodes name.
struct Tree<'a> {
    roots: Vec<Node>,
    children: HashMap<i64, Vec<Node>>,
    /// Each folder's name, by its ID.
    folders: HashMap<String, Option<String>>,
    /// Each split's widths, a JSON list of each page's, by its tab's ID.
    widths: HashMap<String, Option<String>>,
    /// Each page, by its content pane's ID.
    pages: HashMap<String, PinPage>,
    /// The folders open in a window, by ID.
    open_folders: &'a HashSet<String>,
}

/// Its spaces with their pins, and the profile's favourites. A folder is
/// open if it is in `open_folders`.
pub fn read(db: &Connection, open_folders: &HashSet<String>) -> Result<Spaces, ReadError> {
    let tree = Tree::read(db, open_folders)?;
    let favorites = tree.root_pins("favorites", None);
    let mut query = db.prepare(
        "SELECT id, title, theme, theme_intensity FROM spaces ORDER BY creation_date, id",
    )?;
    let spaces = query
        .query_map([], |row| {
            let id: String = row.get(0)?;
            Ok(Space {
                name: name_or(row.get::<_, Option<String>>(1)?.as_deref(), UNNAMED_SPACE),
                icon: SpaceIcon::None,
                look: look(row.get::<_, Option<String>>(2)?.as_deref(), row.get(3)?),
                pins: pruned(
                    [
                        tree.root_pins("pinned_container", Some(&id)),
                        tree.root_pins("window", Some(&id)),
                    ]
                    .concat(),
                ),
            })
        })?
        .collect::<Result<_, _>>()?;
    Ok(Spaces { favorites, spaces })
}

impl<'a> Tree<'a> {
    fn read(db: &Connection, open_folders: &'a HashSet<String>) -> Result<Tree<'a>, ReadError> {
        let mut roots = Vec::new();
        let mut children: HashMap<i64, Vec<Node>> = HashMap::new();
        let mut query = db.prepare(
            "SELECT id, kind, entity_id, parent_id, space_id FROM nodes \
             WHERE deleted_at IS NULL ORDER BY parent_id, \"order\", id",
        )?;
        let mut rows = query.query([])?;
        while let Some(row) = rows.next()? {
            let node = Node {
                id: row.get(0)?,
                kind: row.get(1)?,
                entity: row.get(2)?,
                space: row.get(4)?,
            };
            match row.get::<_, Option<i64>>(3)? {
                Some(parent) => children.entry(parent).or_default().push(node),
                None => roots.push(node),
            }
        }
        // A pane keeps the page it shows last.
        let mut pages = HashMap::new();
        let mut query = db.prepare(
            "SELECT p.id, p.custom_title, w.url, w.title FROM content_panes p \
             JOIN web_contents w ON w.content_pane_id = p.id ORDER BY w.id",
        )?;
        let mut rows = query.query([])?;
        while let Some(row) = rows.next()? {
            let url: String = row.get(2)?;
            if is_page(&url) {
                // Its custom title is the user's name for it.
                let name: Option<String> = row.get(1)?;
                let title: Option<String> = row.get(3)?;
                pages.insert(
                    row.get(0)?,
                    PinPage::new(title.as_deref(), name.as_deref(), &url),
                );
            }
        }
        Ok(Tree {
            roots,
            children,
            folders: by_id(db, "SELECT id, title FROM tab_groups")?,
            widths: by_id(db, "SELECT id, split_view_widths FROM tabs")?,
            pages,
            open_folders,
        })
    }

    // The widths of the pages of the split in tab `id`; none if it keeps
    // none.
    fn widths(&self, id: &str) -> Vec<f64> {
        self.widths
            .get(id)
            .and_then(Option::as_deref)
            .and_then(|widths| serde_json::from_str(widths).ok())
            .unwrap_or_default()
    }

    // The pins under every root of `kind`, of `space` if it names one, in
    // order.
    fn root_pins(&self, kind: &str, space: Option<&str>) -> Vec<Pin> {
        self.roots
            .iter()
            .filter(|node| node.kind == kind && space.is_none_or(|space| node.space == space))
            .flat_map(|node| self.children_pins(node.id))
            .collect()
    }

    // The pins under node `id`, in order.
    fn children_pins(&self, id: i64) -> Vec<Pin> {
        self.children
            .get(&id)
            .into_iter()
            .flatten()
            .flat_map(|child| self.pins(child))
            .collect()
    }

    // A node as pins: a tab of one page or a folder is one; a tab of two
    // pages is a split, and one of more is its pages.
    fn pins(&self, node: &Node) -> Vec<Pin> {
        match node.kind.as_str() {
            "group" => vec![Pin::Folder {
                name: name_or(
                    self.folders.get(&node.entity).and_then(Option::as_deref),
                    UNNAMED_FOLDER,
                ),
                pins: self.children_pins(node.id),
                open: self.open_folders.contains(&node.entity),
            }],
            "tab" => {
                let pages: Vec<PinPage> = self
                    .children
                    .get(&node.id)
                    .into_iter()
                    .flatten()
                    .filter(|child| child.kind == "content_pane")
                    .filter_map(|pane| self.pages.get(&pane.entity).cloned())
                    .collect();
                match <[PinPage; 2]>::try_from(pages) {
                    Ok([first, second]) => vec![Pin::Split {
                        ratio: split_ratio(&self.widths(&node.entity)),
                        first,
                        second,
                        stacked: false,
                    }],
                    Err(pages) => pages.into_iter().map(Pin::Tab).collect(),
                }
            }
            _ => Vec::new(),
        }
    }
}

// Each row's second column by its first, of what `sql` selects.
fn by_id(db: &Connection, sql: &str) -> Result<HashMap<String, Option<String>>, ReadError> {
    let mut query = db.prepare(sql)?;
    let rows = query.query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?;
    Ok(rows.collect::<Result<_, _>>()?)
}

// How its theme draws it: the colour it names, and how much of it shows.
fn look(theme: Option<&str>, intensity: Option<f64>) -> Look {
    let colour = COLOURS
        .iter()
        .find(|(name, _)| Some(*name) == theme)
        .map(|(_, colour)| colour.map(|part| f64::from(part) / 255.0));
    Look {
        colours: colour.into_iter().collect(),
        intensity: intensity.filter(|intensity| (0.0..=1.0).contains(intensity)),
        ..Look::default()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // A sidebar as Dia writes it, with what each test needs.
    fn sidebar(rows: &str) -> Connection {
        let db = Connection::open_in_memory().unwrap();
        db.execute_batch(&format!(
            "CREATE TABLE spaces (id TEXT, title TEXT, creation_date DATE, theme TEXT, theme_intensity DOUBLE);
             CREATE TABLE nodes (id INTEGER, kind TEXT, entity_id TEXT, parent_id INTEGER, \"order\" INTEGER,
                                 deleted_at DATETIME, space_id TEXT DEFAULT '');
             CREATE TABLE tabs (id TEXT, split_view_widths TEXT);
             CREATE TABLE tab_groups (id TEXT, title TEXT);
             CREATE TABLE content_panes (id TEXT, custom_title TEXT);
             CREATE TABLE web_contents (id INTEGER, content_pane_id TEXT, url TEXT, title TEXT);
             {rows}"
        ))
        .unwrap();
        db
    }

    // A tab node `id` under `parent` at `order`, of one pane per page.
    fn tab(id: i64, parent: i64, order: i64, pages: &[(&str, Option<&str>)]) -> String {
        let mut sql = format!(
            "INSERT INTO nodes VALUES ({id}, 'tab', 't{id}', {parent}, {order}, NULL, '');
             INSERT INTO tabs VALUES ('t{id}', NULL);"
        );
        for (index, (url, name)) in pages.iter().enumerate() {
            let pane = id * 10 + index as i64;
            let name = name.map_or("NULL".into(), |name| format!("'{name}'"));
            sql += &format!(
                "INSERT INTO nodes VALUES ({pane}, 'content_pane', 'p{pane}', {id}, {index}, NULL, '');
                 INSERT INTO content_panes VALUES ('p{pane}', {name});
                 INSERT INTO web_contents VALUES ({pane}, 'p{pane}', '{url}', 'Title {pane}');"
            );
        }
        sql
    }

    #[test]
    fn brings_spaces_with_their_pins_and_the_favourites() {
        let rows = [
            "INSERT INTO spaces VALUES ('s2', 'Later', '2026-02-01', 'neutral', NULL);
             INSERT INTO spaces VALUES ('s1', 'Home', '2026-01-01', 'blue', 0.4);
             INSERT INTO nodes VALUES (1, 'favorites', 'f', NULL, 0, NULL, 's1');
             INSERT INTO nodes VALUES (2, 'pinned_container', 'c', NULL, 0, NULL, 's1');
             INSERT INTO nodes VALUES (3, 'window', 'w', NULL, 0, NULL, 's1');
             INSERT INTO nodes VALUES (7, 'window', 'w2', NULL, 0, '2026-03-01', 's1');
             INSERT INTO nodes VALUES (4, 'group', 'g4', 2, 1, NULL, '');
             INSERT INTO tab_groups VALUES ('g4', 'Docs');
             INSERT INTO nodes VALUES (5, 'group', 'g5', 2, 2, NULL, '');
             INSERT INTO tab_groups VALUES ('g5', 'Empty');
             INSERT INTO nodes VALUES (6, 'tab', 't6', 2, 3, '2026-03-01', '');"
                .to_owned(),
            tab(11, 1, 0, &[("https://mail.example/", None)]),
            tab(12, 2, 0, &[("https://a.example/", Some("Mine"))]),
            tab(13, 4, 0, &[("https://b.example/", None)]),
            tab(
                14,
                2,
                4,
                &[("https://c.example/", None), ("https://d.example/", None)],
            ),
            tab(15, 3, 0, &[("https://open.example/", None)]),
            tab(16, 2, 5, &[("about:blank", None)]),
            tab(17, 7, 0, &[("https://closed.example/", None)]),
        ];
        let db = sidebar(&rows.concat());
        let spaces = read(&db, &HashSet::from(["g4".to_owned()])).unwrap();
        assert_eq!(spaces.favorites.len(), 1);
        // In the order they were made.
        let [home, later] = &spaces.spaces[..] else {
            unreachable!()
        };
        assert_eq!((home.name.as_str(), later.name.as_str()), ("Home", "Later"));
        assert_eq!(home.look.colours, [[0.0, 122.0 / 255.0, 1.0]]);
        assert_eq!(home.look.intensity, Some(0.4));
        assert!(later.look.colours.is_empty() && later.pins.is_empty());
        // Its pinned tabs: one the user named, a folder left open, and a
        // split; then its sidebar's tab. Not the empty folder, the deleted
        // tab, the blank page or the closed window's tab.
        let [
            Pin::Tab(named),
            Pin::Folder {
                name,
                pins,
                open: true,
            },
            Pin::Split { ratio, .. },
            Pin::Tab(open),
        ] = &home.pins[..]
        else {
            panic!("{:?}", home.pins)
        };
        assert_eq!(open.url, "https://open.example/");
        assert_eq!(named.name.as_deref(), Some("Mine"));
        assert_eq!((name.as_str(), pins.len()), ("Docs", 1));
        assert_eq!(*ratio, 0.5);
    }
}
