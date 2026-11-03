// A Chromium profile's bookmarks: its `Bookmarks` file, JSON. The bar's are
// the bar's; Other Bookmarks' are the rest, with the phone's in a folder.

use std::fs;
use std::path::Path;

use serde_json::Value;

use crate::import::data::{Bookmarks, Pin, PinPage, is_page};
use crate::import::source::ReadError;

pub fn read(profile: &Path) -> Result<Bookmarks, ReadError> {
    let text = fs::read_to_string(profile.join("Bookmarks"))?;
    Ok(from_json(&serde_json::from_str(&text)?))
}

pub fn from_json(file: &Value) -> Bookmarks {
    let roots = &file["roots"];
    let mut other = children(&roots["other"]);
    other.push(Pin::closed_folder(
        "Mobile Bookmarks",
        children(&roots["synced"]),
    ));
    Bookmarks {
        bar: children(&roots["bookmark_bar"]),
        other,
    }
    .pruned()
}

fn children(node: &Value) -> Vec<Pin> {
    node["children"]
        .as_array()
        .map(|children| children.iter().filter_map(item).collect())
        .unwrap_or_default()
}

fn item(node: &Value) -> Option<Pin> {
    let name = node["name"].as_str().unwrap_or("");
    match node["type"].as_str()? {
        "url" => {
            let url = node["url"].as_str()?;
            is_page(url).then(|| Pin::Tab(PinPage::bookmark(name, url)))
        }
        "folder" => Some(Pin::closed_folder(name, children(node))),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    #[test]
    fn keeps_the_bar_apart_from_the_rest() {
        let file = json!({ "roots": {
            "bookmark_bar": { "children": [
                { "type": "url", "name": "A", "url": "https://a.example/" },
                { "type": "url", "name": "Script", "url": "javascript:alert(1)" },
            ]},
            "other": { "children": [
                { "type": "folder", "name": "Empty", "children": [] },
                { "type": "url", "name": "B", "url": "https://b.example/" },
            ]},
            "synced": { "children": [] },
        }});
        let bookmarks = from_json(&file);
        assert_eq!(bookmarks.count(), 2);
        assert!(matches!(&bookmarks.bar[..], [Pin::Tab(a)] if a.title == "A"));
        assert!(matches!(&bookmarks.other[..], [Pin::Tab(b)] if b.title == "B"));
    }
}
