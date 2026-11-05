// The favicons a Chromium profile kept for its pages: its `Favicons` file,
// where `icon_mapping` names each page's icon and `favicon_bitmaps` holds
// its images, PNGs of 16 and 32 pixels.

use std::path::Path;

use crate::import::data::Favicons;
use crate::import::favicons;
use crate::import::snapshot::Snapshot;
use crate::import::source::ReadError;

pub fn read(profile: &Path, pages: &[String]) -> Result<Favicons, ReadError> {
    let snapshot = Snapshot::of(&profile.join("Favicons"))?;
    favicons::read(
        &snapshot.db,
        pages,
        // Only the pages it kept an image for, so that one without falls
        // back to its site's.
        "SELECT DISTINCT page_url, icon_mapping.icon_id FROM icon_mapping
         JOIN favicon_bitmaps ON favicon_bitmaps.icon_id = icon_mapping.icon_id
         WHERE image_data IS NOT NULL",
        "SELECT image_data, width FROM favicon_bitmaps WHERE icon_id = ?1",
    )
}
