// A Gecko profile's history and bookmarks, both in its `places.sqlite`:
// pages in `moz_places`, bookmarks in `moz_bookmarks`, under the roots the
// toolbar, the menu, Other Bookmarks and the phone's. The toolbar's are the
// bar's; the rest are Other Bookmarks', with the menu's and the phone's
// each in a folder.

use std::collections::HashMap;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::Connection;
use wren::HistoryEntry;

use crate::import::data::{Bookmarks, Pin, PinPage, is_page};
use crate::import::snapshot::Snapshot;
use crate::import::source::ReadError;

const BATCH: usize = 5_000;

// The roots, by their GUIDs.
const TOOLBAR: &str = "toolbar_____";
const MENU: &str = "menu________";
const OTHER: &str = "unfiled_____";
const MOBILE: &str = "mobile______";

pub fn history(profile: &Path, batch: &mut dyn FnMut(Vec<HistoryEntry>)) -> Result<(), ReadError> {
    let snapshot = Snapshot::of(&profile.join("places.sqlite"))?;
    let mut query = snapshot.db.prepare(
        "SELECT url, title, visit_count, typed, last_visit_date FROM moz_places \
         WHERE hidden = 0 AND last_visit_date IS NOT NULL",
    )?;
    let mut rows = query.query([])?;
    let mut entries = Vec::with_capacity(BATCH);
    while let Some(row) = rows.next()? {
        let url: String = row.get(0)?;
        if !is_page(&url) {
            continue;
        }
        let title: Option<String> = row.get(1)?;
        let last_visit: i64 = row.get(4)?;
        entries.push(HistoryEntry {
            url,
            title: title.filter(|title| !title.is_empty()),
            visit_count: row.get(2)?,
            typed_count: row.get(3)?,
            last_visit_ms: last_visit / 1000,
        });
        if entries.len() == BATCH {
            batch(std::mem::replace(&mut entries, Vec::with_capacity(BATCH)));
        }
    }
    if !entries.is_empty() {
        batch(entries);
    }
    Ok(())
}

pub fn history_count(db: &Connection) -> Result<usize, ReadError> {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |since| since.as_micros() as i64);
    let since = now - 90 * 24 * 60 * 60 * 1_000_000;
    let count: i64 = db.query_row(
        "SELECT COUNT(*) FROM moz_places WHERE hidden = 0 AND last_visit_date > ?1",
        [since],
        |row| row.get(0),
    )?;
    Ok(count as usize)
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
    let mut other = vec![Pin::Folder {
        name: "Bookmarks Menu".into(),
        pins: root(MENU),
    }];
    other.extend(root(OTHER));
    other.push(Pin::Folder {
        name: "Mobile Bookmarks".into(),
        pins: root(MOBILE),
    });
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
            (1, Some(url)) if is_page(url) => Some(Pin::Tab(PinPage {
                title: node.title.clone(),
                url: url.clone(),
                favicon: None,
            })),
            (2, _) => Some(Pin::Folder {
                name: node.title.clone(),
                pins: pins(node.id, children),
            }),
            _ => None,
        })
        .collect()
}
