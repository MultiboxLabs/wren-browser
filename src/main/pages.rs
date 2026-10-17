// The renderer's pages, and serving them from the app's bundle.

use std::path::{Component, Path, PathBuf};

use wren::{SchemeFailure, SchemeRequest, SchemeResponse};

/// A page of the renderer, the folder `host` of src/renderer. The app serves
/// it as <scheme>://<host>/ from its bundle; a development build loads it
/// from Vite's server at <WREN_DEV_URL>/<host>/ instead.
pub struct Page {
    pub scheme: &'static str,
    pub host: &'static str,
    pub title: &'static str,
    pub size: (f64, f64),
    /// Its page may call the app (`wren.invoke`).
    pub messages: bool,
}

pub const UI: Page = Page {
    scheme: "app",
    host: "ui",
    title: "Wren",
    size: (1100.0, 760.0),
    messages: true,
};

pub const GAME: Page = Page {
    scheme: "wren",
    host: "game",
    title: "Twig & Trill",
    size: (900.0, 640.0),
    messages: false,
};

const PAGES: [&Page; 2] = [&UI, &GAME];

impl Page {
    pub fn url(&self) -> String {
        match dev_url() {
            Some(dev) => format!("{dev}/{}/", self.host),
            None => format!("{}://{}/", self.scheme, self.host),
        }
    }
}

pub fn dev_url() -> Option<String> {
    let url = std::env::var("WREN_DEV_URL").ok()?;
    Some(url.trim_end_matches('/').to_owned())
}

// The pages' schemes, each once.
pub fn schemes() -> Vec<&'static str> {
    let mut schemes: Vec<_> = PAGES.iter().map(|page| page.scheme).collect();
    schemes.dedup();
    schemes
}

// Answers <scheme>://<host>/<path> for a page: its own files are in
// <root>/<host>, and the files the pages share in <root>/assets.
pub fn serve_page(request: SchemeRequest, root: &Path) {
    let url = request.url();
    let file = url.split_once("://").and_then(|(scheme, rest)| {
        let (host, path) = rest.split_once('/').unwrap_or((rest, ""));
        PAGES
            .iter()
            .find(|page| page.scheme == scheme && page.host == host)?;
        let relative = match path.split(['?', '#']).next().unwrap_or("") {
            "" => format!("{host}/index.html"),
            path if path.starts_with("assets/") => path.to_owned(),
            path => format!("{host}/{path}"),
        };
        Path::new(&relative)
            .components()
            .all(|component| matches!(component, Component::Normal(_)))
            .then(|| root.join(&relative))
    });
    let response = match file {
        Some(file) if file.is_file() => SchemeResponse::File {
            path: file.to_string_lossy().into_owned(),
            headers: Vec::new(),
        },
        _ => SchemeResponse::Failure(SchemeFailure::NotFound),
    };
    let _ = request.respond(response);
}

// The renderer `wren bundle` copied into Contents/Resources.
pub fn renderer_root() -> PathBuf {
    let executable = std::env::current_exe().unwrap();
    let contents = executable.parent().and_then(Path::parent).unwrap();
    contents.join("Resources/renderer")
}
