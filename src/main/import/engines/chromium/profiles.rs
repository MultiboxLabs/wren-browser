// A Chromium-based browser's profiles: those `Local State` lists, less any
// the browser keeps for itself (a guest's, the system's, one hidden from its
// list), and any whose folder is gone.

use std::fs;
use std::path::Path;

use serde_json::Value;

use crate::import::source::{ReadError, SourceProfile};

// Folders Chromium keeps for itself, never a user's.
const OWN_FOLDERS: [&str; 2] = ["System Profile", "Guest Profile"];

pub fn read(root: &Path, one_profile: bool, name: &str) -> Result<Vec<SourceProfile>, ReadError> {
    if one_profile {
        if !root.is_dir() {
            return Err(ReadError::Missing);
        }
        return Ok(vec![SourceProfile {
            id: "Default".into(),
            name: name.into(),
            in_use: true,
            default_name: true,
            folder: root.to_path_buf(),
        }]);
    }
    let state = match fs::read_to_string(root.join("Local State")) {
        Ok(text) => serde_json::from_str(&text)?,
        // A browser that never wrote one has its one profile only.
        Err(_) if root.join("Default").is_dir() => Value::Null,
        Err(error) => return Err(error.into()),
    };
    Ok(from_local_state(&state, |id| root.join(id).is_dir())
        .into_iter()
        .map(|mut profile| {
            profile.folder = root.join(&profile.id);
            profile
        })
        .collect())
}

/// The profiles `Local State` lists, by its own order, whose folders
/// `exists` says are there. Folders are left empty, for `read` to fill.
pub fn from_local_state(state: &Value, exists: impl Fn(&str) -> bool) -> Vec<SourceProfile> {
    let profile = &state["profile"];
    let last_used = profile["last_used"].as_str().unwrap_or("Default");
    let Some(cache) = profile["info_cache"].as_object() else {
        return exists("Default")
            .then(|| SourceProfile {
                id: "Default".into(),
                name: "Default".into(),
                in_use: true,
                default_name: true,
                folder: Default::default(),
            })
            .into_iter()
            .collect();
    };
    let mut order: Vec<&str> = profile["profiles_order"]
        .as_array()
        .map(|order| order.iter().filter_map(Value::as_str).collect())
        .unwrap_or_default();
    let mut rest: Vec<&str> = cache
        .keys()
        .map(String::as_str)
        .filter(|id| !order.contains(id))
        .collect();
    rest.sort_by_key(|id| (*id != "Default", *id));
    order.extend(rest);
    order
        .into_iter()
        .filter_map(|id| {
            let info = cache.get(id)?;
            let hidden = info["is_ephemeral"].as_bool() == Some(true)
                || info["is_omitted_from_profile_list"].as_bool() == Some(true);
            if hidden || OWN_FOLDERS.contains(&id) || !exists(id) {
                return None;
            }
            Some(SourceProfile {
                id: id.into(),
                name: info["name"].as_str().unwrap_or(id).into(),
                in_use: id == last_used,
                default_name: info["is_using_default_name"].as_bool().unwrap_or(false),
                folder: Default::default(),
            })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    #[test]
    fn lists_the_users_profiles_only() {
        let state = json!({ "profile": {
            "last_used": "Profile 1",
            "profiles_order": ["Default", "Profile 1"],
            "info_cache": {
                "Default": { "name": "Person 1", "is_using_default_name": true },
                "Profile 1": { "name": "Work" },
                "Profile 2": { "name": "Gone" },
                "Profile 3": { "name": "Hidden", "is_omitted_from_profile_list": true },
                "Guest Profile": { "name": "Guest" },
            }
        }});
        let profiles = from_local_state(&state, |id| id != "Profile 2");
        let names: Vec<_> = profiles
            .iter()
            .map(|p| (p.id.as_str(), p.in_use, p.default_name))
            .collect();
        assert_eq!(
            names,
            [("Default", false, true), ("Profile 1", true, false)]
        );
    }
}
