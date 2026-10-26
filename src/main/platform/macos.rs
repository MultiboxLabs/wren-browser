// macOS's side of platform/mod.rs: Quick Look draws a file's thumbnail, as
// the Finder shows it, and NSWorkspace a file type's icon.

use std::cell::{Cell, RefCell};
use std::collections::HashMap;
use std::path::Path;
use std::ptr::NonNull;

use block2::RcBlock;
use dispatch2::DispatchQueue;
use objc2::AllocAnyThread;
use objc2_app_kit::{NSBitmapImageFileType, NSBitmapImageRep, NSImage, NSWorkspace};
use objc2_core_graphics::CGImage;
use objc2_foundation::{NSDictionary, NSError, NSPoint, NSRect, NSSize, NSString, NSURL};
use objc2_quick_look_thumbnailing::{
    QLThumbnailGenerationRequest, QLThumbnailGenerationRequestRepresentationTypes,
    QLThumbnailGenerator, QLThumbnailRepresentation,
};
use objc2_uniform_type_identifiers::UTType;

// What has a thumbnail once it is drawn.
type Done = Box<dyn FnOnce(Option<Vec<u8>>)>;

// Drawn at twice the size in points, as on a Retina screen.
const SCALE: f64 = 2.0;

thread_local! {
    // Thumbnails being drawn, by ID: what has each stays on the main thread,
    // and only its ID goes to Quick Look's.
    static WAITING: RefCell<HashMap<u64, Done>> = RefCell::default();
    static NEXT_ID: Cell<u64> = const { Cell::new(0) };
}

pub fn file_thumbnail(path: &str, size: f64, done: impl FnOnce(Option<Vec<u8>>) + 'static) {
    if path.is_empty() || !Path::new(path).exists() {
        return done(None);
    }
    let id = NEXT_ID.with(|next| next.replace(next.get() + 1));
    WAITING.with_borrow_mut(|waiting| waiting.insert(id, Box::new(done)));
    let url = NSURL::fileURLWithPath(&NSString::from_str(path));
    let request = unsafe {
        QLThumbnailGenerationRequest::initWithFileAtURL_size_scale_representationTypes(
            QLThumbnailGenerationRequest::alloc(),
            &url,
            NSSize::new(size, size),
            SCALE,
            QLThumbnailGenerationRequestRepresentationTypes::All,
        )
    };
    // On a queue of Quick Look's: the PNG is made there, and only it comes
    // back to the main thread.
    let handler = RcBlock::new(
        move |representation: *mut QLThumbnailRepresentation, _: *mut NSError| {
            let png = NonNull::new(representation)
                .and_then(|representation| png(&*unsafe { representation.as_ref().CGImage() }));
            DispatchQueue::main().exec_async(move || {
                if let Some(done) = WAITING.with_borrow_mut(|waiting| waiting.remove(&id)) {
                    done(png);
                }
            });
        },
    );
    unsafe {
        QLThumbnailGenerator::sharedGenerator()
            .generateBestRepresentationForRequest_completionHandler(&request, &handler);
    }
}

pub fn file_type_icon(name: &str, size: f64) -> Option<Vec<u8>> {
    let extension = Path::new(name).extension()?.to_str()?;
    let kind = UTType::typeWithFilenameExtension(&NSString::from_str(extension))?;
    let icon = NSWorkspace::sharedWorkspace().iconForContentType(&kind);
    image_png(&icon, size)
}

// An image drawn at `size` points, as a PNG.
fn image_png(image: &NSImage, size: f64) -> Option<Vec<u8>> {
    let mut rect = NSRect::new(NSPoint::ZERO, NSSize::new(size * SCALE, size * SCALE));
    let cg = unsafe { image.CGImageForProposedRect_context_hints(&mut rect, None, None) }?;
    png(&cg)
}

fn png(image: &CGImage) -> Option<Vec<u8>> {
    let rep = NSBitmapImageRep::initWithCGImage(NSBitmapImageRep::alloc(), image);
    let data = unsafe {
        rep.representationUsingType_properties(NSBitmapImageFileType::PNG, &NSDictionary::new())
    }?;
    Some(data.to_vec())
}
