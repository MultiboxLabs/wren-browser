// Bookmarks, landed in a folder "Imported from <Source>" in Other Bookmarks,
// with the source's folders inside it. A page the profile has bookmarked
// already is left out, so bringing them over again adds nothing twice; and
// the folder goes if nothing was left to put in it.

use wren::{BookmarkID, OTHER_BOOKMARKS, Profile};

use crate::import::data::{Bookmark, BookmarkFolder};

/// Whether the profile's bookmarks are there to add to: Chromium loads
/// them after the profile, and refuses changes until then.
pub fn ready(profile: &Profile) -> bool {
    profile.bookmarks_state().is_ok_and(|state| state.loaded)
}

/// Adds `tree`, and answers how many bookmarks it added.
pub fn land(profile: &Profile, source: &str, tree: &BookmarkFolder) -> Result<usize, String> {
    let at = profile.bookmark_children(OTHER_BOOKMARKS).len();
    let folder = profile
        .add_bookmark(
            OTHER_BOOKMARKS,
            at,
            &format!("Imported from {source}"),
            None,
        )
        .map_err(|error| format!("Wren could not make the folder: {error:?}"))?;
    let added = add(profile, folder, &tree.children)?;
    if added == 0 {
        let _ = profile.remove_bookmark(folder);
    }
    Ok(added)
}

fn add(profile: &Profile, folder: BookmarkID, children: &[Bookmark]) -> Result<usize, String> {
    let mut added = 0;
    for child in children {
        let at = profile.bookmark_children(folder).len();
        match child {
            Bookmark::Link { title, url } => {
                if !profile.bookmarks_for_url(url).is_empty() {
                    continue;
                }
                if profile.add_bookmark(folder, at, title, Some(url)).is_ok() {
                    added += 1;
                }
            }
            Bookmark::Folder(inner) => {
                let made = profile
                    .add_bookmark(folder, at, &inner.title, None)
                    .map_err(|error| format!("Wren could not make a folder: {error:?}"))?;
                let count = add(profile, made, &inner.children)?;
                if count == 0 {
                    let _ = profile.remove_bookmark(made);
                }
                added += count;
            }
        }
    }
    Ok(added)
}
