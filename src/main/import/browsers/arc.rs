// A Chromium-based browser that keeps spaces: Chromium's engine, and its
// sidebar, `StorableSidebar.json` beside its `User Data`. Its profiles are
// fewer than Chromium's: it keeps a hidden one of its own
// (`__ARC_SYSTEM_PROFILE`), and a profile no space points at is one its UI
// no longer shows. A space synced from another Mac names that Mac's
// profile, so only a space of this Mac's counts; its preferences say which
// Mac this is (`machineID`).
//
// The sidebar's `spaces` and `items` alternate an ID with what it names. A
// space has a title, its profile, an icon and a theme, and its pinned
// tabs' container; an item is a tab, a folder (`list`), a split, or a
// container, with its children in order. `topAppsContainerIDs` alternates a
// profile with the container of its favourites.

use std::collections::{HashMap, HashSet};
use std::fs;

use serde_json::Value;

use crate::import::data::{Look, Pin, PinPage, Space, SpaceIcon, Spaces, is_page};
use crate::import::engines::chromium::Chromium;
use crate::import::source::{About, Engine, ReadError, Source, SourceProfile, Survey};
use crate::platform;

/// The name it gives its own hidden profile, and any like it.
const OWN_PROFILE_PREFIX: &str = "__ARC_";

pub struct Arc {
    chromium: Chromium,
}

impl Arc {
    pub const fn new(chromium: Chromium) -> Arc {
        Arc { chromium }
    }

    fn sidebar(&self) -> Result<Sidebar, ReadError> {
        let file = self.chromium.root().with_file_name("StorableSidebar.json");
        let json: Value = serde_json::from_str(&fs::read_to_string(file)?)?;
        let this_mac = this_mac();
        Ok(Sidebar::from_json(&json, this_mac.as_deref()))
    }
}

// This Mac's ID, as the browser knows it.
fn this_mac() -> Option<String> {
    let preferences =
        platform::home_dir().join("Library/Preferences/company.thebrowser.Browser.plist");
    let preferences = platform::read_property_list(&preferences).ok()?;
    preferences["machineID"].as_str().map(str::to_owned)
}

impl Source for Arc {
    fn about(&self) -> &About {
        Source::about(&self.chromium)
    }

    fn engine(&self) -> &dyn Engine {
        &self.chromium
    }

    fn profiles(&self) -> Result<Vec<SourceProfile>, ReadError> {
        let sidebar = self.sidebar()?;
        let mut profiles: Vec<SourceProfile> = Engine::profiles(&self.chromium)?
            .into_iter()
            .filter(|profile| {
                !profile.name.starts_with(OWN_PROFILE_PREFIX)
                    && sidebar.profiles.contains(&profile.id)
            })
            .collect();
        // The one in use is its last; if that is not a real one, the first.
        if !profiles.iter().any(|profile| profile.in_use)
            && let Some(first) = profiles.first_mut()
        {
            first.in_use = true;
        }
        Ok(profiles)
    }

    fn survey(&self, profile: &SourceProfile) -> Survey {
        let mut survey = Engine::survey(&self.chromium, profile);
        if let Ok(spaces) = self.spaces(profile) {
            survey.spaces = Some((spaces.spaces.len(), spaces.pin_count()));
        }
        survey
    }

    fn keeps_spaces(&self) -> bool {
        true
    }

    fn spaces(&self, profile: &SourceProfile) -> Result<Spaces, ReadError> {
        Ok(self.sidebar()?.spaces_of(&profile.id))
    }
}

/// The sidebar, as far as bringing it over goes.
pub struct Sidebar {
    /// The profiles this Mac's spaces point at, by folder.
    pub profiles: HashSet<String>,
    // Each space with its profile's folder, in order.
    spaces: Vec<(String, Value)>,
    // Each profile's favourites' container.
    favorites: Vec<(String, String)>,
    items: HashMap<String, Value>,
}

impl Sidebar {
    pub fn from_json(json: &Value, this_mac: Option<&str>) -> Sidebar {
        let containers = json["sidebar"]["containers"]
            .as_array()
            .cloned()
            .unwrap_or_default();
        let container = containers
            .iter()
            .find(|container| container.get("spaces").is_some())
            .cloned()
            .unwrap_or_default();
        let objects = |key: &str| -> Vec<Value> {
            container[key]
                .as_array()
                .into_iter()
                .flatten()
                .filter(|value| value.is_object())
                .cloned()
                .collect()
        };
        let items = objects("items")
            .into_iter()
            .filter_map(|item| Some((item["id"].as_str()?.to_owned(), item)))
            .collect();
        // Every space's profile, and the favourites' owners: which Mac each
        // is of, to take this one's where none says.
        let owners: Vec<(Value, Option<String>)> = container["topAppsContainerIDs"]
            .as_array()
            .map(|list| {
                list.chunks(2)
                    .filter_map(|pair| {
                        Some((
                            pair.first()?.clone(),
                            pair.get(1)?.as_str().map(str::to_owned),
                        ))
                    })
                    .collect()
            })
            .unwrap_or_default();
        let this_mac = this_mac.map(str::to_owned).or_else(|| {
            let mut counts: HashMap<String, usize> = HashMap::new();
            for (owner, _) in &owners {
                if let Some((_, Some(machine))) = profile_of(owner) {
                    *counts.entry(machine).or_default() += 1;
                }
            }
            counts
                .into_iter()
                .max_by_key(|(_, count)| *count)
                .map(|(machine, _)| machine)
        });
        // A profile counts if it is this Mac's.
        let ours = |reference: &Value| -> Option<String> {
            let (folder, machine) = profile_of(reference)?;
            match (machine, &this_mac) {
                (Some(machine), Some(this_mac)) if machine != *this_mac => None,
                _ => Some(folder),
            }
        };
        let spaces: Vec<(String, Value)> = objects("spaces")
            .into_iter()
            .filter_map(|space| Some((ours(&space["profile"])?, space)))
            .collect();
        let favorites = owners
            .iter()
            .filter_map(|(owner, container)| Some((ours(owner)?, container.clone()?)))
            .collect();
        Sidebar {
            profiles: spaces.iter().map(|(folder, _)| folder.clone()).collect(),
            spaces,
            favorites,
            items,
        }
    }

    /// The spaces of the profile in folder `profile`, with their pins, and
    /// its favourites.
    pub fn spaces_of(&self, profile: &str) -> Spaces {
        let favorites = self
            .favorites
            .iter()
            .filter(|(folder, _)| folder == profile)
            .flat_map(|(_, container)| self.children(container))
            .collect();
        let spaces = self
            .spaces
            .iter()
            .filter(|(folder, _)| folder == profile)
            .map(|(_, space)| Space {
                name: space["title"]
                    .as_str()
                    .filter(|title| !title.is_empty())
                    .unwrap_or("Space")
                    .to_owned(),
                icon: icon(&space["customInfo"]["iconType"]),
                look: look(&space["customInfo"]["windowTheme"]),
                pins: pinned_container(space)
                    .map(|container| self.children(&container))
                    .unwrap_or_default(),
            })
            .collect();
        Spaces { favorites, spaces }
    }

    // The pins in the item `id`, in order.
    fn children(&self, id: &str) -> Vec<Pin> {
        let Some(item) = self.items.get(id) else {
            return Vec::new();
        };
        item["childrenIds"]
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(|child| self.items.get(child.as_str()?))
            .flat_map(|child| self.pins(child))
            .collect()
    }

    // An item as pins: a tab or a folder is one; a split of two is one, and
    // of more, its tabs.
    fn pins(&self, item: &Value) -> Vec<Pin> {
        let data = &item["data"];
        if let Some(page) = page(item) {
            return vec![Pin::Tab(page)];
        }
        if data.get("list").is_some() {
            return vec![Pin::Folder {
                name: item["title"].as_str().unwrap_or("Folder").to_owned(),
                pins: self.children(item["id"].as_str().unwrap_or_default()),
            }];
        }
        if let Some(split) = data.get("splitView") {
            let pages: Vec<PinPage> = item["childrenIds"]
                .as_array()
                .into_iter()
                .flatten()
                .filter_map(|child| page(self.items.get(child.as_str()?)?))
                .collect();
            if let [first, second] = &pages[..] {
                let widths: Vec<f64> = split["itemWidthFactors"]
                    .as_array()
                    .into_iter()
                    .flatten()
                    .filter_map(Value::as_f64)
                    .collect();
                let ratio = match &widths[..] {
                    [a, b, ..] if a + b > 0.0 => a / (a + b),
                    _ => 0.5,
                };
                return vec![Pin::Split {
                    first: first.clone(),
                    second: second.clone(),
                    stacked: split["layoutOrientation"].as_str() == Some("vertical"),
                    ratio,
                }];
            }
            return pages.into_iter().map(Pin::Tab).collect();
        }
        Vec::new()
    }
}

/// A profile reference's folder, and the Mac it is of: `{ "default": true }`
/// is `Default`'s, of any Mac.
pub fn profile_of(reference: &Value) -> Option<(String, Option<String>)> {
    if reference.get("default").is_some() {
        return Some(("Default".into(), None));
    }
    let custom = &reference["custom"]["_0"];
    let folder = custom["directoryBasename"].as_str()?;
    Some((
        folder.to_owned(),
        custom["machineID"].as_str().map(str::to_owned),
    ))
}

fn page(item: &Value) -> Option<PinPage> {
    let tab = item["data"].get("tab")?;
    let url = tab["savedURL"].as_str().filter(|url| is_page(url))?;
    let title = item["title"]
        .as_str()
        .or(tab["savedTitle"].as_str())
        .unwrap_or(url);
    Some(PinPage {
        title: title.to_owned(),
        url: url.to_owned(),
        favicon: None,
    })
}

// The container its pinned tabs are in: after "pinned" in its list.
fn pinned_container(space: &Value) -> Option<String> {
    let ids = space["containerIDs"].as_array()?;
    let at = ids.iter().position(|id| id.as_str() == Some("pinned"))?;
    ids.get(at + 1)?.as_str().map(str::to_owned)
}

fn icon(kind: &Value) -> SpaceIcon {
    if let Some(emoji) = kind["emoji_v2"].as_str().or(kind["emoji"].as_str()) {
        return SpaceIcon::Emoji(emoji.to_owned());
    }
    match kind["icon"].as_str() {
        Some(name) => SpaceIcon::Named(name.to_owned()),
        None => SpaceIcon::None,
    }
}

// How its theme draws it: a single colour, as it was picked, with its
// intensity, grain and light or dark. A theme of another kind gives its
// palette's mid tone, as near as Wren comes to it.
fn look(theme: &Value) -> Look {
    let background = &theme["background"]["single"]["_0"];
    let dark = match background["contentOverBackgroundAppearance"].as_str() {
        Some("dark") => Some(true),
        Some("light") => Some(false),
        _ => None,
    };
    let single = &background["style"]["color"]["_0"]["blendedSingleColor"]["_0"];
    let modifiers = &single["modifiers"];
    match colour(&single["color"]) {
        Some(colour) => Look {
            colours: vec![colour],
            dark,
            intensity: modifiers["intensityFactor"].as_f64(),
            noise: modifiers["noiseFactor"].as_f64().unwrap_or(0.0),
        },
        None => Look {
            colours: colour(&theme["primaryColorPalette"]["midTone"])
                .into_iter()
                .collect(),
            ..Look::default()
        },
    }
}

// A colour in extended sRGB, as it keeps them.
fn colour(colour: &Value) -> Option<[f64; 3]> {
    let part = |name: &str| colour[name].as_f64().filter(|value| value.is_finite());
    Some([part("red")?, part("green")?, part("blue")?])
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    fn sidebar() -> Value {
        let custom = |folder: &str, machine: &str| json!({ "custom": { "_0": { "directoryBasename": folder, "machineID": machine } } });
        json!({ "sidebar": { "containers": [ { "global": {} }, {
            "spaces": [
                "s1", { "id": "s1", "title": "Home", "profile": { "default": true },
                        "containerIDs": ["pinned", "p1", "unpinned", "u1"],
                        "customInfo": { "iconType": { "emoji_v2": "🏠" },
                                        "windowTheme": { "background": { "single": { "_0": {
                                            "contentOverBackgroundAppearance": "dark",
                                            "style": { "color": { "_0": { "blendedSingleColor": { "_0": {
                                                "color": { "red": 0.4, "green": -0.01, "blue": 1.04 },
                                                "modifiers": { "intensityFactor": 0.6, "noiseFactor": 0.25 } } } } } } } } },
                                        "primaryColorPalette": { "midTone": { "red": 0.7, "green": 0.6, "blue": 1.0 } } } } },
                "s2", { "id": "s2", "title": "School", "profile": custom("Profile 1", "this"),
                        "containerIDs": ["pinned", "p2", "unpinned", "u2"], "customInfo": { "iconType": { "icon": "book" } } },
                "s3", { "id": "s3", "title": "Elsewhere", "profile": custom("Profile 2", "other"),
                        "containerIDs": ["pinned", "p3", "unpinned", "u3"] },
            ],
            "topAppsContainerIDs": [ { "default": true }, "f1", custom("Profile 4", "this"), "f4" ],
            "items": [
                "p1", { "id": "p1", "childrenIds": ["t1", "l1", "v1"], "data": { "itemContainer": {} } },
                "t1", { "id": "t1", "title": null, "childrenIds": [], "data": { "tab": { "savedURL": "https://a.example/", "savedTitle": "A" } } },
                "l1", { "id": "l1", "title": "Folder", "childrenIds": ["t2"], "data": { "list": {} } },
                "t2", { "id": "t2", "title": "Mine", "childrenIds": [], "data": { "tab": { "savedURL": "https://b.example/", "savedTitle": "B" } } },
                "v1", { "id": "v1", "childrenIds": ["t3", "t4"], "data": { "splitView": { "layoutOrientation": "horizontal", "itemWidthFactors": [3.0, 1.0] } } },
                "t3", { "id": "t3", "childrenIds": [], "data": { "tab": { "savedURL": "https://c.example/", "savedTitle": "C" } } },
                "t4", { "id": "t4", "childrenIds": [], "data": { "tab": { "savedURL": "https://d.example/", "savedTitle": "D" } } },
                "f1", { "id": "f1", "childrenIds": ["t1"], "data": { "itemContainer": {} } },
            ],
        } ] } })
    }

    #[test]
    fn only_this_macs_profiles_with_spaces_are_real() {
        let sidebar = Sidebar::from_json(&sidebar(), Some("this"));
        let mut profiles: Vec<_> = sidebar.profiles.iter().cloned().collect();
        profiles.sort();
        // Profile 2 is another Mac's; Profile 4 has favourites but no space.
        assert_eq!(profiles, ["Default", "Profile 1"]);
    }

    #[test]
    fn brings_spaces_with_their_pins() {
        let spaces = Sidebar::from_json(&sidebar(), Some("this")).spaces_of("Default");
        assert_eq!(spaces.favorites.len(), 1);
        let home = &spaces.spaces[0];
        assert_eq!(
            (home.name.as_str(), &home.icon),
            ("Home", &SpaceIcon::Emoji("🏠".into()))
        );
        // The colour picked, not its palette's.
        assert_eq!(
            home.look,
            Look {
                colours: vec![[0.4, -0.01, 1.04]],
                dark: Some(true),
                intensity: Some(0.6),
                noise: 0.25,
            }
        );
        // A favourite, then a tab, a folder of one and a split.
        assert_eq!(spaces.pin_count(), 4);
        assert!(
            matches!(&home.pins[1], Pin::Folder { name, pins } if name == "Folder" && pins.len() == 1)
        );
        assert!(
            matches!(&home.pins[2], Pin::Split { ratio, stacked: false, .. } if (*ratio - 0.75).abs() < 1e-9)
        );
    }
}
