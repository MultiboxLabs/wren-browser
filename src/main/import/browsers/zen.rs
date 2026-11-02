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

use crate::import::data::{Pin, PinPage, Space, SpaceIcon, Spaces, count_pins, is_page};
use crate::import::engines::gecko::{Gecko, mozlz4};
use crate::import::source::{About, Engine, ReadError, Source, SourceProfile, Survey};

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

    fn survey(&self, profile: &SourceProfile) -> Survey {
        let mut survey = Engine::survey(&self.gecko, profile);
        if let Ok(spaces) = self.spaces(profile)
            && !spaces.spaces.is_empty()
        {
            survey.spaces = Some((spaces.spaces.len(), spaces.pin_count()));
        }
        survey
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
    let folders: HashMap<String, Value> = list("folders")
        .into_iter()
        .filter_map(|folder| Some((folder["id"].as_str()?.to_owned(), folder)))
        .collect();
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
    let page_of = |tab: &Value| -> Option<PinPage> {
        let entry = tab["entries"].as_array()?.last()?;
        let url = entry["url"].as_str().filter(|url| is_page(url))?;
        Some(PinPage {
            title: entry["title"].as_str().unwrap_or(url).to_owned(),
            url: url.to_owned(),
        })
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
        } else if let Some(folder) = tab["groupId"]
            .as_str()
            .filter(|id| folders.contains_key(*id))
        {
            in_folder.entry(folder.to_owned()).or_default().push(pin);
        } else if let Some(space) = tab["zenWorkspace"].as_str() {
            in_space.entry(space.to_owned()).or_default().push(pin);
        }
    }

    // A folder, with the folders in it, then its pins.
    fn folder_pin(
        id: &str,
        folders: &HashMap<String, Value>,
        in_folder: &mut HashMap<String, Vec<Pin>>,
    ) -> Pin {
        let children: Vec<String> = folders
            .iter()
            .filter(|(_, folder)| folder["parentId"].as_str() == Some(id))
            .map(|(child, _)| child.clone())
            .collect();
        let mut pins: Vec<Pin> = children
            .iter()
            .map(|child| folder_pin(child, folders, in_folder))
            .collect();
        pins.extend(in_folder.remove(id).unwrap_or_default());
        Pin::Folder {
            name: folders[id]["name"].as_str().unwrap_or("Folder").to_owned(),
            pins,
        }
    }

    let spaces = list("spaces")
        .iter()
        .map(|space| {
            let id = space["uuid"].as_str().unwrap_or_default();
            let mut pins: Vec<Pin> = list("folders")
                .iter()
                .filter(|folder| {
                    folder["workspaceId"].as_str() == Some(id) && folder["parentId"].is_null()
                })
                .filter_map(|folder| folder["id"].as_str())
                .map(|folder| folder_pin(folder, &folders, &mut in_folder))
                .filter(|pin| matches!(pin, Pin::Folder { pins, .. } if count_pins(pins) > 0))
                .collect();
            pins.extend(in_space.remove(id).unwrap_or_default());
            Space {
                name: space["name"]
                    .as_str()
                    .filter(|name| !name.is_empty())
                    .unwrap_or("Space")
                    .to_owned(),
                icon: icon(space["icon"].as_str()),
                colours: space["theme"]["gradientColors"]
                    .as_array()
                    .into_iter()
                    .flatten()
                    .filter_map(|colour| {
                        let parts = colour["c"].as_array()?;
                        let part = |index: usize| {
                            parts
                                .get(index)?
                                .as_f64()
                                .map(|value| value.clamp(0.0, 255.0) as u8)
                        };
                        Some([part(0)?, part(1)?, part(2)?])
                    })
                    .collect(),
                pins,
            }
        })
        .collect();
    Spaces { favorites, spaces }
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
            "folders": [{ "id": "f1", "name": "Docs", "workspaceId": "w1", "parentId": null }],
            "splitViewData": [{ "groupId": "g1", "gridType": "vsep", "tabs": ["c", "d"] }],
            "tabs": [
                tab("a", "https://a.example/", "w1", json!({ "zenEssential": true })),
                tab("b", "https://b.example/", "w1", json!({ "groupId": "f1" })),
                tab("c", "https://c.example/", "w1", json!({ "groupId": "g1" })),
                tab("d", "https://d.example/", "w1", json!({ "groupId": "g1" })),
                tab("e", "https://e.example/", "w1", json!({ "pinned": false })),
            ],
        });
        let spaces = from_sessions(&sessions);
        assert_eq!(spaces.favorites.len(), 1);
        let work = &spaces.spaces[0];
        assert_eq!(work.icon, SpaceIcon::Named("briefcase".into()));
        assert_eq!(work.colours, [[10, 20, 30]]);
        assert!(
            matches!(&work.pins[0], Pin::Folder { name, pins } if name == "Docs" && pins.len() == 1)
        );
        assert!(matches!(&work.pins[1], Pin::Split { stacked: false, .. }));
        assert_eq!(work.pins.len(), 2);
    }
}
