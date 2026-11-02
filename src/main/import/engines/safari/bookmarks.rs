// Safari's bookmarks: its `Bookmarks.plist`, a tree of lists and leaves. Its
// bar and menu each go in a folder named for them, its Reading List too, and
// the rest at the top. Its History entry is a proxy, and is left out.

use std::path::Path;

use serde_json::Value;

use crate::import::data::{Bookmark, BookmarkFolder, is_page};
use crate::import::source::ReadError;
use crate::platform;

pub fn read(folder: &Path) -> Result<BookmarkFolder, ReadError> {
    let plist = platform::read_property_list(&folder.join("Bookmarks.plist"))?;
    Ok(from_plist(&plist))
}

pub fn from_plist(root: &Value) -> BookmarkFolder {
    let children = root["Children"]
        .as_array()
        .map(|children| children.iter().filter_map(item).collect())
        .unwrap_or_default();
    BookmarkFolder {
        title: String::new(),
        children,
    }
    .pruned()
}

fn item(node: &Value) -> Option<Bookmark> {
    match node["WebBookmarkType"].as_str()? {
        "WebBookmarkTypeLeaf" => {
            let url = node["URLString"].as_str()?;
            is_page(url).then(|| Bookmark::Link {
                title: node["URIDictionary"]["title"]
                    .as_str()
                    .unwrap_or(url)
                    .into(),
                url: url.into(),
            })
        }
        "WebBookmarkTypeList" => {
            let title = match node["Title"].as_str().unwrap_or("") {
                "BookmarksBar" => "Bookmarks Bar",
                "BookmarksMenu" => "Bookmarks Menu",
                "com.apple.ReadingList" => "Reading List",
                title => title,
            };
            Some(Bookmark::Folder(BookmarkFolder {
                title: title.into(),
                children: node["Children"]
                    .as_array()
                    .map(|children| children.iter().filter_map(item).collect())
                    .unwrap_or_default(),
            }))
        }
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;

    #[test]
    fn names_safaris_own_lists() {
        let plist = json!({ "Children": [
            { "WebBookmarkType": "WebBookmarkTypeProxy", "Title": "History" },
            { "WebBookmarkType": "WebBookmarkTypeList", "Title": "BookmarksBar", "Children": [
                { "WebBookmarkType": "WebBookmarkTypeLeaf", "URLString": "https://a.example/",
                  "URIDictionary": { "title": "A" } },
            ]},
            { "WebBookmarkType": "WebBookmarkTypeList", "Title": "com.apple.ReadingList", "Children": [] },
        ]});
        let tree = from_plist(&plist);
        assert_eq!(tree.count(), 1);
        assert!(
            matches!(&tree.children[..], [Bookmark::Folder(bar)] if bar.title == "Bookmarks Bar")
        );
    }
}
