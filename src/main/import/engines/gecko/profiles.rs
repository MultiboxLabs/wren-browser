// A Gecko-based browser's profiles: the `[Profile<n>]` sections of its
// `profiles.ini` whose folders have a `places.sqlite`. The one an
// `[Install…]` section names as its default is the one in use; or, with
// none, the one marked `Default=1`.

use std::fs;
use std::path::Path;

use crate::import::source::{ReadError, SourceProfile};

pub fn read(root: &Path) -> Result<Vec<SourceProfile>, ReadError> {
    let text = fs::read_to_string(root.join("profiles.ini"))?;
    Ok(from_ini(&text)
        .into_iter()
        .filter_map(|(mut profile, path, relative)| {
            profile.folder = if relative {
                root.join(&path)
            } else {
                path.into()
            };
            profile
                .folder
                .join("places.sqlite")
                .is_file()
                .then_some(profile)
        })
        .collect())
}

/// Each profile, with its path and whether that is under the data folder.
pub fn from_ini(text: &str) -> Vec<(SourceProfile, String, bool)> {
    // Each section's name and its keys.
    let mut sections: Vec<(String, Vec<(String, String)>)> = Vec::new();
    for line in text.lines().map(str::trim) {
        if let Some(name) = line
            .strip_prefix('[')
            .and_then(|line| line.strip_suffix(']'))
        {
            sections.push((name.to_owned(), Vec::new()));
        } else if let (Some((key, value)), Some((_, keys))) =
            (line.split_once('='), sections.last_mut())
        {
            keys.push((key.trim().to_owned(), value.trim().to_owned()));
        }
    }
    let get = |keys: &[(String, String)], key: &str| {
        keys.iter()
            .find(|(name, _)| name == key)
            .map(|(_, value)| value.clone())
    };
    let installed = sections
        .iter()
        .find(|(name, _)| name.starts_with("Install"))
        .and_then(|(_, keys)| get(keys, "Default"));
    sections
        .iter()
        .filter(|(name, _)| name.starts_with("Profile"))
        .filter_map(|(_, keys)| {
            let path = get(keys, "Path")?;
            let in_use = match &installed {
                Some(default) => *default == path,
                None => get(keys, "Default").as_deref() == Some("1"),
            };
            let name = get(keys, "Name").unwrap_or_else(|| path.clone());
            let profile = SourceProfile {
                id: path.clone(),
                default_name: name.starts_with("default"),
                name,
                in_use,
                folder: Default::default(),
            };
            Some((
                profile,
                path,
                get(keys, "IsRelative").as_deref() != Some("0"),
            ))
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_installs_default_is_in_use() {
        let ini = "[Install4F96D1932A9F858E]\nDefault=Profiles/b.default-release\n\n\
                   [Profile1]\nName=default\nIsRelative=1\nPath=Profiles/a.default\nDefault=1\n\n\
                   [Profile0]\nName=default-release\nIsRelative=1\nPath=Profiles/b.default-release\n\n\
                   [General]\nVersion=2\n";
        let profiles = from_ini(ini);
        let used: Vec<_> = profiles
            .iter()
            .map(|(p, _, _)| (p.id.as_str(), p.in_use))
            .collect();
        assert_eq!(
            used,
            [
                ("Profiles/a.default", false),
                ("Profiles/b.default-release", true)
            ]
        );
    }
}
