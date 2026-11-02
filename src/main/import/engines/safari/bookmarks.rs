// Safari's bookmarks: its `Bookmarks.plist`, a tree of lists and leaves. Its
// bar's are the bar's; the rest are Other Bookmarks', with its menu and its
// Reading List each in a folder. Its History entry is a proxy, and is left
// out.

use std::path::Path;

use serde_json::Value;

use crate::import::data::{Bookmarks, Pin, PinPage, is_page};
use crate::import::source::ReadError;
use crate::platform;

pub fn read(folder: &Path) -> Result<Bookmarks, ReadError> {
    let plist = platform::read_property_list(&folder.join("Bookmarks.plist"))?;
    Ok(from_plist(&plist))
}

pub fn from_plist(root: &Value) -> Bookmarks {
    let mut bookmarks = Bookmarks::default();
    for node in root["Children"].as_array().into_iter().flatten() {
        if node["Title"].as_str() == Some("BookmarksBar") {
            bookmarks.bar = children(node);
        } else {
            bookmarks.other.extend(item(node));
        }
    }
    bookmarks.pruned()
}

fn children(node: &Value) -> Vec<Pin> {
    node["Children"]
        .as_array()
        .map(|children| children.iter().filter_map(item).collect())
        .unwrap_or_default()
}

fn item(node: &Value) -> Option<Pin> {
    match node["WebBookmarkType"].as_str()? {
        "WebBookmarkTypeLeaf" => {
            let url = node["URLString"].as_str()?;
            is_page(url).then(|| {
                Pin::Tab(PinPage {
                    title: node["URIDictionary"]["title"]
                        .as_str()
                        .unwrap_or(url)
                        .into(),
                    url: url.into(),
                    favicon: None,
                })
            })
        }
        "WebBookmarkTypeList" => {
            let name = match node["Title"].as_str().unwrap_or("") {
                "BookmarksMenu" => "Bookmarks Menu",
                "com.apple.ReadingList" => "Reading List",
                title => title,
            };
            Some(Pin::Folder {
                name: name.into(),
                pins: children(node),
            })
        }
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    #[test]
    fn keeps_the_bar_apart_and_names_safaris_own_lists() {
        let plist = json!({ "Children": [
            { "WebBookmarkType": "WebBookmarkTypeProxy", "Title": "History" },
            { "WebBookmarkType": "WebBookmarkTypeList", "Title": "BookmarksBar", "Children": [
                { "WebBookmarkType": "WebBookmarkTypeLeaf", "URLString": "https://a.example/",
                  "URIDictionary": { "title": "A" } },
            ]},
            { "WebBookmarkType": "WebBookmarkTypeList", "Title": "com.apple.ReadingList", "Children": [
                { "WebBookmarkType": "WebBookmarkTypeLeaf", "URLString": "https://b.example/",
                  "URIDictionary": { "title": "B" } },
            ]},
        ]});
        let bookmarks = from_plist(&plist);
        assert_eq!(bookmarks.count(), 2);
        assert!(matches!(&bookmarks.bar[..], [Pin::Tab(a)] if a.title == "A"));
        assert!(
            matches!(&bookmarks.other[..], [Pin::Folder { name, .. }] if name == "Reading List")
        );
    }
}
