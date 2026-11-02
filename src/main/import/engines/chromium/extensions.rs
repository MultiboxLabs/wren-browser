// A Chromium profile's extensions from the Chrome Web Store: those its
// preferences say came from the store, and not with the browser, with their
// names and icons from their own copies on disk.

use std::fs;
use std::path::{Path, PathBuf};

use serde_json::{Map, Value};

use crate::import::data::StoreExtension;
use crate::import::source::ReadError;

pub fn read(profile: &Path) -> Result<Vec<StoreExtension>, ReadError> {
    let mut settings = Map::new();
    // On macOS they are in Secure Preferences; elsewhere, in Preferences.
    for file in ["Preferences", "Secure Preferences"] {
        let Ok(text) = fs::read_to_string(profile.join(file)) else {
            continue;
        };
        let prefs: Value = serde_json::from_str(&text)?;
        if let Some(found) = prefs["extensions"]["settings"].as_object() {
            for (id, value) in found {
                settings
                    .entry(id.clone())
                    .or_insert(Value::Object(Default::default()));
                if let (Some(into), Some(from)) = (settings[id].as_object_mut(), value.as_object())
                {
                    into.extend(from.clone());
                }
            }
        }
    }
    let mut extensions: Vec<StoreExtension> = settings
        .iter()
        .filter(|(_, setting)| from_store(setting))
        .filter_map(|(id, setting)| {
            let folder = newest_version(&profile.join("Extensions").join(id))?;
            let manifest: Value =
                serde_json::from_str(&fs::read_to_string(folder.join("manifest.json")).ok()?)
                    .ok()?;
            Some(StoreExtension {
                id: id.clone(),
                name: name(&manifest, &folder)?,
                icon: icon(&manifest, &folder),
                enabled: enabled(setting),
            })
        })
        .collect();
    extensions.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(extensions)
}

/// The user installed it from the store; the browser did not bring it.
pub fn from_store(setting: &Value) -> bool {
    setting["from_webstore"].as_bool() == Some(true)
        && setting["was_installed_by_default"].as_bool() != Some(true)
}

/// It is on: by its state, as older versions write it, or by having no
/// reason to be off, as newer ones do.
pub fn enabled(setting: &Value) -> bool {
    match &setting["disable_reasons"] {
        Value::Array(reasons) => reasons.is_empty(),
        Value::Number(reasons) => reasons.as_u64() == Some(0),
        _ => setting["state"].as_i64().unwrap_or(1) == 1,
    }
}

// Its newest version's folder: Chromium keeps one, named for its version.
fn newest_version(folder: &Path) -> Option<PathBuf> {
    let mut versions: Vec<PathBuf> = fs::read_dir(folder)
        .ok()?
        .filter_map(|entry| entry.ok().map(|entry| entry.path()))
        .filter(|path| path.join("manifest.json").is_file())
        .collect();
    versions.sort_by_key(|path| {
        path.file_name()
            .and_then(|name| name.to_str())
            .map(|name| {
                name.split(['.', '_'])
                    .map(|part| part.parse::<u64>().unwrap_or(0))
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default()
    });
    versions.pop()
}

// Its name, or the message its manifest names for it in its own language.
fn name(manifest: &Value, folder: &Path) -> Option<String> {
    let name = manifest["name"].as_str()?;
    let Some(key) = name
        .strip_prefix("__MSG_")
        .and_then(|rest| rest.strip_suffix("__"))
    else {
        return Some(name.to_owned());
    };
    let locale = manifest["default_locale"].as_str().unwrap_or("en");
    let messages: Value = serde_json::from_str(
        &fs::read_to_string(folder.join("_locales").join(locale).join("messages.json")).ok()?,
    )
    .ok()?;
    let messages = messages.as_object()?;
    let (_, message) = messages
        .iter()
        .find(|(name, _)| name.eq_ignore_ascii_case(key))?;
    message["message"].as_str().map(str::to_owned)
}

// Its largest PNG icon.
fn icon(manifest: &Value, folder: &Path) -> Option<Vec<u8>> {
    let icons = manifest["icons"].as_object()?;
    let (_, path) = icons
        .iter()
        .filter_map(|(size, path)| Some((size.parse::<u32>().ok()?, path.as_str()?)))
        .max_by_key(|(size, _)| *size)?;
    let png = fs::read(folder.join(path.trim_start_matches('/'))).ok()?;
    png.starts_with(b"\x89PNG").then_some(png)
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    #[test]
    fn tells_the_users_store_extensions() {
        assert!(from_store(&json!({ "from_webstore": true })));
        assert!(!from_store(
            &json!({ "from_webstore": true, "was_installed_by_default": true })
        ));
        assert!(!from_store(&json!({ "location": 4 })));
        assert!(enabled(&json!({ "disable_reasons": [] })));
        assert!(!enabled(&json!({ "disable_reasons": [1] })));
        assert!(!enabled(&json!({ "state": 0 })));
    }
}
