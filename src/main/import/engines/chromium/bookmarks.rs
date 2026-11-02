// A Chromium profile's bookmarks: its `Bookmarks` file, JSON. The bar's go
// in a folder of their own; Other Bookmarks' are at the top; the phone's go
// in a folder too.

use std::fs;
use std::path::Path;

use serde_json::Value;

use crate::import::data::{Bookmark, BookmarkFolder, is_page};
use crate::import::source::ReadError;

pub fn read(profile: &Path) -> Result<BookmarkFolder, ReadError> {
    let text = fs::read_to_string(profile.join("Bookmarks"))?;
    Ok(from_json(&serde_json::from_str(&text)?))
}

pub fn from_json(file: &Value) -> BookmarkFolder {
    let roots = &file["roots"];
    let mut children = Vec::new();
    children.push(Bookmark::Folder(folder(
        "Bookmarks Bar",
        &roots["bookmark_bar"],
    )));
    children.extend(folder("", &roots["other"]).children);
    children.push(Bookmark::Folder(folder(
        "Mobile Bookmarks",
        &roots["synced"],
    )));
    BookmarkFolder {
        title: String::new(),
        children,
    }
    .pruned()
}

fn folder(title: &str, node: &Value) -> BookmarkFolder {
    let children = node["children"]
        .as_array()
        .map(|children| children.iter().filter_map(item).collect())
        .unwrap_or_default();
    BookmarkFolder {
        title: title.into(),
        children,
    }
}

fn item(node: &Value) -> Option<Bookmark> {
    let name = node["name"].as_str().unwrap_or("");
    match node["type"].as_str()? {
        "url" => {
            let url = node["url"].as_str()?;
            is_page(url).then(|| Bookmark::Link {
                title: name.into(),
                url: url.into(),
            })
        }
        "folder" => Some(Bookmark::Folder(folder(name, node))),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    #[test]
    fn keeps_the_bar_in_a_folder_and_other_at_the_top() {
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
        let tree = from_json(&file);
        assert_eq!(tree.count(), 2);
        assert_eq!(tree.children.len(), 2);
        assert!(matches!(&tree.children[0], Bookmark::Folder(bar) if bar.title == "Bookmarks Bar"));
    }
}
