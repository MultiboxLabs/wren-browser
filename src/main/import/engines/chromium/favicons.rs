// The favicons a Chromium profile kept for its pages: its `Favicons` file,
// where `icon_mapping` names each page's icon and `favicon_bitmaps` holds
// its images, PNGs of 16 and 32 pixels.

use std::collections::HashMap;
use std::path::Path;

use crate::import::favicons;
use crate::import::snapshot::Snapshot;
use crate::import::source::ReadError;

pub fn read(profile: &Path, pages: &[String]) -> Result<HashMap<String, Vec<u8>>, ReadError> {
    let snapshot = Snapshot::of(&profile.join("Favicons"))?;
    let db = &snapshot.db;
    let kept = db
        // Only the pages it kept an image for, so that one without falls
        // back to its site's.
        .prepare(
            "SELECT DISTINCT page_url, icon_mapping.icon_id FROM icon_mapping
             JOIN favicon_bitmaps ON favicon_bitmaps.icon_id = icon_mapping.icon_id
             WHERE image_data IS NOT NULL",
        )?
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
        })?
        .collect::<Result<Vec<_>, _>>()?;
    let mut images =
        db.prepare("SELECT image_data, width FROM favicon_bitmaps WHERE icon_id = ?1")?;
    let mut icons = HashMap::new();
    for (page, icon) in favicons::match_pages(pages, kept) {
        let found = images
            .query_map([icon], |row| {
                Ok((row.get::<_, Vec<u8>>(0)?, row.get::<_, i64>(1)?))
            })?
            .collect::<Result<Vec<_>, _>>()?;
        if let Some(png) = favicons::best(found) {
            icons.insert(page, png);
        }
    }
    Ok(icons)
}
