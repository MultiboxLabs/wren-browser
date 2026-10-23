// The renderer built into the executable (see build.rs). Nothing is read from
// disk when a page loads, so the files cannot be swapped under a running or
// installed app without breaking the executable's code signature.

use wren::{SchemeFailure, SchemeResponse};

include!(concat!(env!("OUT_DIR"), "/renderer.rs"));

/// The renderer's file at `path`, relative to its root.
pub fn file(path: &str) -> SchemeResponse {
    let path = path.split('?').next().unwrap_or("");
    match FILES.iter().find(|(name, _)| *name == path) {
        Some((name, body)) => SchemeResponse::data(*body, content_type(name)),
        None => SchemeResponse::Failure(SchemeFailure::NotFound),
    }
}

fn content_type(name: &str) -> &'static str {
    match name.rsplit_once('.').map(|(_, extension)| extension) {
        Some("html") => "text/html; charset=utf-8",
        Some("js" | "mjs") => "text/javascript; charset=utf-8",
        Some("css") => "text/css; charset=utf-8",
        Some("json") => "application/json",
        Some("svg") => "image/svg+xml",
        Some("png") => "image/png",
        Some("jpg" | "jpeg") => "image/jpeg",
        Some("webp") => "image/webp",
        Some("ico") => "image/x-icon",
        Some("woff") => "font/woff",
        Some("woff2") => "font/woff2",
        Some("wasm") => "application/wasm",
        _ => "application/octet-stream",
    }
}
