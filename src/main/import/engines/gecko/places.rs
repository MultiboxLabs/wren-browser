// A Gecko profile's history and bookmarks, both in its `places.sqlite`:
// pages in `moz_places`, bookmarks in `moz_bookmarks`, under the roots the
// toolbar, the menu, Other Bookmarks and the phone's. The toolbar's are the
// bar's; the rest are Other Bookmarks', with the menu's and the phone's
// each in a folder.

use std::collections::HashMap;
use std::path::Path;

use rusqlite::Connection;
use wren::HistoryEntry;

use crate::import::data::{Bookmarks, Pin, PinPage, is_page};
use crate::import::engines::unix_micros;
use crate::import::snapshot::{self, Snapshot};
use crate::import::source::{HISTORY_BATCH, ReadError, history_kept_since};

// The roots, by their GUIDs.
const TOOLBAR: &str = "toolbar_____";
const MENU: &str = "menu________";
const OTHER: &str = "unfiled_____";
const MOBILE: &str = "mobile______";

pub fn history(profile: &Path, batch: &mut dyn FnMut(Vec<HistoryEntry>)) -> Result<(), ReadError> {
    Snapshot::of(&profile.join("places.sqlite"))?.read_in_batches(
        "SELECT url, title, visit_count, typed, last_visit_date FROM moz_places \
         WHERE hidden = 0 AND last_visit_date IS NOT NULL",
        HISTORY_BATCH,
        batch,
        |row| {
            let url: String = row.get(0)?;
            if !is_page(&url) {
                return Ok(None);
            }
            let title: Option<String> = row.get(1)?;
            let last_visit: i64 = row.get(4)?;
            Ok(Some(HistoryEntry {
                url,
                title: title.filter(|title| !title.is_empty()),
                visit_count: row.get(2)?,
                typed_count: row.get(3)?,
                last_visit_ms: last_visit / 1000,
            }))
        },
    )
}

/// How many pages were visited in the time Wren keeps; Gecko's time is
/// microseconds since 1970.
pub fn history_count(db: &Connection) -> Result<usize, ReadError> {
    snapshot::count(
        db,
        "SELECT COUNT(*) FROM moz_places WHERE hidden = 0 AND last_visit_date > ?1",
        [unix_micros(history_kept_since())],
    )
}

pub fn bookmark_count(db: &Connection) -> Result<usize, ReadError> {
    Ok(tree(db)?.count())
}

pub fn bookmarks(profile: &Path) -> Result<Bookmarks, ReadError> {
    let snapshot = Snapshot::of(&profile.join("places.sqlite"))?;
    tree(&snapshot.db)
}

fn tree(db: &Connection) -> Result<Bookmarks, ReadError> {
    // Every bookmark and folder, by its folder, in order.
    let mut query = db.prepare(
        "SELECT b.id, b.type, b.parent, b.title, b.guid, p.url FROM moz_bookmarks b \
         LEFT JOIN moz_places p ON p.id = b.fk ORDER BY b.parent, b.position",
    )?;
    let mut children: HashMap<i64, Vec<Node>> = HashMap::new();
    let mut guids: HashMap<String, i64> = HashMap::new();
    let mut rows = query.query([])?;
    while let Some(row) = rows.next()? {
        let node = Node {
            id: row.get(0)?,
            kind: row.get(1)?,
            title: row.get::<_, Option<String>>(3)?.unwrap_or_default(),
            url: row.get(5)?,
        };
        guids.insert(row.get(4)?, node.id);
        children.entry(row.get(2)?).or_default().push(node);
    }
    let root = |guid: &str| {
        guids
            .get(guid)
            .map(|&id| pins(id, &children))
            .unwrap_or_default()
    };
    let mut other = vec![Pin::closed_folder("Bookmarks Menu", root(MENU))];
    other.extend(root(OTHER));
    other.push(Pin::closed_folder("Mobile Bookmarks", root(MOBILE)));
    Ok(Bookmarks {
        bar: root(TOOLBAR),
        other,
    }
    .pruned())
}

struct Node {
    id: i64,
    /// 1 a bookmark, 2 a folder, 3 a separator.
    kind: i64,
    title: String,
    url: Option<String>,
}

// What is in the folder `id`, in order.
fn pins(id: i64, children: &HashMap<i64, Vec<Node>>) -> Vec<Pin> {
    children
        .get(&id)
        .into_iter()
        .flatten()
        .filter_map(|node| match (node.kind, &node.url) {
            (1, Some(url)) if is_page(url) => Some(Pin::Tab(PinPage::bookmark(&node.title, url))),
            (2, _) => Some(Pin::closed_folder(&node.title, pins(node.id, children))),
            _ => None,
        })
        .collect()
}
