// The favicons a Gecko profile kept for its pages: its `favicons.sqlite`,
// where `moz_icons_to_pages` names each page's icons in `moz_icons`, one row
// for each size, of which some are SVGs and icons that a pin cannot keep.

use std::collections::HashMap;
use std::path::Path;

use crate::import::data::Favicons;
use crate::import::favicons;
use crate::import::snapshot::Snapshot;
use crate::import::source::ReadError;

pub fn read(profile: &Path, pages: &[String]) -> Result<Favicons, ReadError> {
    let snapshot = Snapshot::of(&profile.join("favicons.sqlite"))?;
    let db = &snapshot.db;
    let kept = db
        // Only the pages it kept an image for, so that one without falls
        // back to its site's.
        .prepare(
            "SELECT DISTINCT page_url, moz_pages_w_icons.id FROM moz_pages_w_icons
             JOIN moz_icons_to_pages ON page_id = moz_pages_w_icons.id
             JOIN moz_icons ON moz_icons.id = icon_id
             WHERE data IS NOT NULL",
        )?
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
        })?
        .collect::<Result<Vec<_>, _>>()?;
    let mut images = db.prepare(
        "SELECT data, width FROM moz_icons
         JOIN moz_icons_to_pages ON moz_icons_to_pages.icon_id = moz_icons.id
         WHERE page_id = ?1 AND data IS NOT NULL",
    )?;
    let mut icons = HashMap::new();
    for (page, page_id) in favicons::match_pages(pages, kept) {
        let found = images
            .query_map([page_id], |row| {
                Ok((row.get::<_, Vec<u8>>(0)?, row.get::<_, i64>(1)?))
            })?
            .collect::<Result<Vec<_>, _>>()?;
        if let Some(png) = favicons::best(found) {
            icons.insert(page, png);
        }
    }
    Ok(icons)
}
