// A Gecko-based browser that keeps spaces: Gecko's engine, and its
// sessions, `zen-sessions.jsonlz4` in each profile (Mozilla's LZ4). Its
// `spaces` have a name, an icon (an emoji, or one of its own icons by URL)
// and a gradient of colours; its pinned `tabs` name their space
// (`zenWorkspace`), and their folder by `groupId`; an essential tab
// (`zenEssential`) is a favourite; `folders` nest by `parentId`; and
// `splitViewData` names a split's tabs by their `zenSyncId`. An older
// version kept its spaces elsewhere: then there are none to bring.

use std::collections::{HashMap, HashSet};
use std::fs;

use serde_json::Value;

use crate::import::data::{
    Look, Pin, PinPage, Space, SpaceIcon, Spaces, UNNAMED_FOLDER, UNNAMED_SPACE, is_page, name_or,
    pruned,
};
use crate::import::engines::gecko::{Gecko, mozlz4};
use crate::import::source::{About, Engine, ReadError, Source, SourceProfile};

pub struct Zen {
    gecko: Gecko,
}

impl Zen {
    pub const fn new(gecko: Gecko) -> Zen {
        Zen { gecko }
    }
}

impl Source for Zen {
    fn about(&self) -> &About {
        Source::about(&self.gecko)
    }

    fn engine(&self) -> &dyn Engine {
        &self.gecko
    }

    fn keeps_spaces(&self) -> bool {
        true
    }

    fn spaces(&self, profile: &SourceProfile) -> Result<Spaces, ReadError> {
        let file = fs::read(profile.folder.join("zen-sessions.jsonlz4"))?;
        let json =
            mozlz4::decompress(&file).ok_or(ReadError::Unreadable("not an LZ4 file".into()))?;
        Ok(from_sessions(&serde_json::from_slice(&json)?))
    }
}

pub fn from_sessions(sessions: &Value) -> Spaces {
    let list = |key: &str| sessions[key].as_array().cloned().unwrap_or_default();
    // In the file's order, which is the order folders in a folder keep.
    let folders: Vec<Value> = list("folders")
        .into_iter()
        .filter(|folder| folder["id"].is_string())
        .collect();
    let is_folder = |id: &str| folders.iter().any(|folder| folder["id"] == id);
    // Each split of two, by its tabs' IDs.
    let mut splits: HashMap<String, (usize, Vec<String>, bool)> = HashMap::new();
    for (index, split) in list("splitViewData").iter().enumerate() {
        let tabs: Vec<String> = split["tabs"]
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(|id| id.as_str().map(str::to_owned))
            .collect();
        let stacked = split["gridType"].as_str() == Some("hsep");
        if tabs.len() == 2 {
            for tab in &tabs {
                splits.insert(tab.clone(), (index, tabs.clone(), stacked));
            }
        }
    }
    let tabs = list("tabs");
    // A pin's page is the one it was pinned on, which it goes back to; or,
    // from before Zen kept that, the one it showed last. Its static label
    // is the user's name for it.
    let page_of = |tab: &Value| -> Option<PinPage> {
        let pinned = &tab["_zenPinnedInitialState"]["entry"];
        let entry = if pinned.is_object() {
            pinned
        } else {
            tab["entries"].as_array()?.last()?
        };
        let url = entry["url"].as_str().filter(|url| is_page(url))?;
        Some(PinPage::new(
            entry["title"].as_str(),
            tab["zenStaticLabel"].as_str(),
            url,
        ))
    };
    let by_sync_id: HashMap<&str, &Value> = tabs
        .iter()
        .filter_map(|tab| Some((tab["zenSyncId"].as_str()?, tab)))
        .collect();

    let mut favorites = Vec::new();
    // Each space's pins, and each folder's, as they are met.
    let mut in_space: HashMap<String, Vec<Pin>> = HashMap::new();
    let mut in_folder: HashMap<String, Vec<Pin>> = HashMap::new();
    let mut splits_made = HashSet::new();
    for tab in tabs
        .iter()
        .filter(|tab| tab["pinned"].as_bool() == Some(true))
    {
        let pin = match tab["zenSyncId"].as_str().and_then(|id| splits.get(id)) {
            Some((index, ids, stacked)) => {
                if !splits_made.insert(*index) {
                    continue;
                }
                let pages: Vec<PinPage> = ids
                    .iter()
                    .filter_map(|id| page_of(by_sync_id.get(id.as_str())?))
                    .collect();
                match &pages[..] {
                    [first, second] => Pin::Split {
                        first: first.clone(),
                        second: second.clone(),
                        stacked: *stacked,
                        ratio: 0.5,
                    },
                    _ => continue,
                }
            }
            None => match page_of(tab) {
                Some(page) => Pin::Tab(page),
                None => continue,
            },
        };
        if tab["zenEssential"].as_bool() == Some(true) {
            favorites.push(pin);
        } else if let Some(folder) = tab["groupId"].as_str().filter(|id| is_folder(id)) {
            in_folder.entry(folder.to_owned()).or_default().push(pin);
        } else if let Some(space) = tab["zenWorkspace"].as_str() {
            in_space.entry(space.to_owned()).or_default().push(pin);
        }
    }

    // A folder, with the folders in it, then its pins.
    fn folder_pin(
        folder: &Value,
        folders: &[Value],
        in_folder: &mut HashMap<String, Vec<Pin>>,
    ) -> Pin {
        let id = folder["id"].as_str().unwrap_or_default();
        let mut pins: Vec<Pin> = folders
            .iter()
            .filter(|child| child["parentId"].as_str() == Some(id))
            .map(|child| folder_pin(child, folders, in_folder))
            .collect();
        pins.extend(in_folder.remove(id).unwrap_or_default());
        Pin::Folder {
            name: name_or(folder["name"].as_str(), UNNAMED_FOLDER),
            pins,
            open: folder["collapsed"].as_bool() == Some(false),
        }
    }

    let spaces = list("spaces")
        .iter()
        .map(|space| {
            let id = space["uuid"].as_str().unwrap_or_default();
            let mut pins: Vec<Pin> = folders
                .iter()
                .filter(|folder| {
                    folder["workspaceId"].as_str() == Some(id) && folder["parentId"].is_null()
                })
                .map(|folder| folder_pin(folder, &folders, &mut in_folder))
                .collect();
            pins.extend(in_space.remove(id).unwrap_or_default());
            Space {
                name: name_or(space["name"].as_str(), UNNAMED_SPACE),
                icon: icon(space["icon"].as_str()),
                look: look(&space["theme"]),
                pins: pruned(pins),
            }
        })
        .collect();
    Spaces { favorites, spaces }
}

// Its gradient's colours, each 0–255 in sRGB, and its grain, 0–1.
fn look(theme: &Value) -> Look {
    Look {
        colours: theme["gradientColors"]
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(|colour| {
                let parts = colour["c"].as_array()?;
                let part =
                    |index: usize| Some(parts.get(index)?.as_f64()?.clamp(0.0, 255.0) / 255.0);
                Some([part(0)?, part(1)?, part(2)?])
            })
            .collect(),
        noise: theme["texture"].as_f64().unwrap_or(0.0),
        ..Look::default()
    }
}

// An emoji, or one of its own icons by URL (`chrome://…/zen-icons/…/<name>.svg`).
fn icon(icon: Option<&str>) -> SpaceIcon {
    match icon.filter(|icon| !icon.is_empty()) {
        None => SpaceIcon::None,
        Some(url) if url.contains("://") => {
            let name = url
                .rsplit('/')
                .next()
                .unwrap_or("")
                .trim_end_matches(".svg");
            SpaceIcon::Named(name.to_owned())
        }
        Some(emoji) => SpaceIcon::Emoji(emoji.to_owned()),
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    #[test]
    fn brings_spaces_folders_splits_and_essentials() {
        let tab = |sync: &str, url: &str, space: &str, extra: Value| {
            let mut tab = json!({ "zenSyncId": sync, "pinned": true, "zenWorkspace": space,
                                  "entries": [{ "url": url, "title": sync }] });
            tab.as_object_mut()
                .unwrap()
                .extend(extra.as_object().unwrap().clone());
            tab
        };
        let sessions = json!({
            "spaces": [{ "uuid": "w1", "name": "Work", "icon": "chrome://browser/skin/zen-icons/selectable/briefcase.svg",
                         "theme": { "gradientColors": [{ "c": [10, 20, 30] }] } }],
            "folders": [{ "id": "f1", "name": "Docs", "workspaceId": "w1", "parentId": null, "collapsed": false }],
            "splitViewData": [{ "groupId": "g1", "gridType": "vsep", "tabs": ["c", "d"] }],
            "tabs": [
                tab("a", "https://a.example/", "w1", json!({ "zenEssential": true })),
                tab("b", "https://b.example/now", "w1", json!({ "groupId": "f1", "zenStaticLabel": "Mine",
                    "_zenPinnedInitialState": { "entry": { "url": "https://b.example/", "title": "B" } } })),
                tab("c", "https://c.example/", "w1", json!({ "groupId": "g1" })),
                tab("d", "https://d.example/", "w1", json!({ "groupId": "g1" })),
                tab("e", "https://e.example/", "w1", json!({ "pinned": false })),
            ],
        });
        let spaces = from_sessions(&sessions);
        assert_eq!(spaces.favorites.len(), 1);
        let work = &spaces.spaces[0];
        assert_eq!(work.icon, SpaceIcon::Named("briefcase".into()));
        assert_eq!(
            work.look.colours,
            [[10.0 / 255.0, 20.0 / 255.0, 30.0 / 255.0]]
        );
        assert!(
            matches!(&work.pins[0], Pin::Folder { name, pins, .. } if name == "Docs" && pins.len() == 1)
        );
        // Named by the user, and on the page it was pinned on, in a folder
        // left open.
        let Pin::Folder {
            pins, open: true, ..
        } = &work.pins[0]
        else {
            unreachable!()
        };
        assert!(matches!(&pins[0], Pin::Tab(page)
            if page.url == "https://b.example/" && page.title == "B" && page.name.as_deref() == Some("Mine")));
        assert!(matches!(&work.pins[1], Pin::Split { stacked: false, .. }));
        assert_eq!(work.pins.len(), 2);
    }

    // Folders in a folder keep the file's order; one left empty goes.
    #[test]
    fn keeps_folders_in_order() {
        let folder = |id: &str, parent: Option<&str>| json!({ "id": id, "name": id, "workspaceId": "w1", "parentId": parent });
        let names = ["c", "a", "d", "b"];
        let mut folders = vec![folder("top", None), folder("empty", Some("top"))];
        folders.extend(names.iter().map(|name| folder(name, Some("top"))));
        let tabs: Vec<Value> = names
            .iter()
            .map(|name| {
                json!({ "pinned": true, "zenWorkspace": "w1", "groupId": name,
                        "entries": [{ "url": format!("https://{name}.example/") }] })
            })
            .collect();
        let sessions = json!({ "spaces": [{ "uuid": "w1", "name": "Work" }],
                               "folders": folders, "tabs": tabs });
        let spaces = from_sessions(&sessions);
        let [Pin::Folder { pins, .. }] = &spaces.spaces[0].pins[..] else {
            unreachable!()
        };
        let inner: Vec<&str> = pins
            .iter()
            .filter_map(|pin| match pin {
                Pin::Folder { name, .. } => Some(name.as_str()),
                _ => None,
            })
            .collect();
        assert_eq!(inner, names);
    }
}
