// The renderer's pages, all on the app's scheme, and serving them.

use std::path::{Component, Path, PathBuf};

use wren::{SchemeFailure, SchemeRequest, SchemeResponse};

use crate::dev_server;

pub const SCHEME: &str = "wren";

/// A page of the renderer, src/renderer/pages/<host>, shown as
/// wren://<host>/.
pub struct Page {
    pub host: &'static str,
    pub title: &'static str,
    pub size: (f64, f64),
    /// Its page may call the app (`wren.invoke`).
    pub messages: bool,
}

pub const UI: Page = Page {
    host: "ui",
    title: "Wren",
    size: (1100.0, 760.0),
    messages: true,
};

pub const GAME: Page = Page {
    host: "game",
    title: "Twig & Trill",
    size: (900.0, 640.0),
    messages: false,
};

const PAGES: [&Page; 2] = [&UI, &GAME];

impl Page {
    pub fn url(&self) -> String {
        format!("{SCHEME}://{}/", self.host)
    }
}

/// Where the pages' files come from.
#[derive(Clone)]
pub enum Source {
    /// The renderer `wren bundle` copied into Contents/Resources.
    Bundle(PathBuf),
    /// Vite's dev server, at this address.
    DevServer(String),
}

impl Source {
    /// The dev server named by WREN_DEV_URL, in a debug build only: a
    /// shipped app serves only what it carries.
    pub fn from_env() -> Source {
        match std::env::var("WREN_DEV_URL") {
            Ok(url) if cfg!(debug_assertions) => {
                Source::DevServer(url.trim_end_matches('/').to_owned())
            }
            _ => {
                let executable = std::env::current_exe().unwrap();
                let contents = executable.parent().and_then(Path::parent).unwrap();
                Source::Bundle(contents.join("Resources/renderer"))
            }
        }
    }

    /// Chromium switches for pages from the dev server: Local Network
    /// Access would refuse their live updates from localhost, as a web view
    /// cannot ask, and their console goes to the terminal.
    pub fn development_switches(&self) -> Vec<String> {
        match self {
            Source::Bundle(_) => Vec::new(),
            Source::DevServer(_) => vec![
                "--disable-features=LocalNetworkAccessChecks".into(),
                "--enable-logging=stderr".into(),
                "--log-level=0".into(),
            ],
        }
    }
}

// Answers wren://<host>/<path> for a page. Every page has the renderer's one
// entry, index.html, which shows the page its host names.
pub fn serve_page(request: SchemeRequest, source: &Source) {
    let url = request.url();
    let Some((host, path)) = url
        .strip_prefix(SCHEME)
        .and_then(|rest| rest.strip_prefix("://"))
        .map(|rest| rest.split_once('/').unwrap_or((rest, "")))
    else {
        let _ = request.respond(SchemeResponse::Failure(SchemeFailure::NotFound));
        return;
    };
    if !PAGES.iter().any(|page| page.host == host) {
        let _ = request.respond(SchemeResponse::Failure(SchemeFailure::NotFound));
        return;
    }
    let path = path.split('#').next().unwrap_or("");
    match source {
        Source::DevServer(server) => dev_server::proxy(request, format!("{server}/{path}")),
        Source::Bundle(root) => {
            let _ = request.respond(bundle_file(root, path));
        }
    }
}

fn bundle_file(root: &Path, path: &str) -> SchemeResponse {
    let path = match path.split('?').next().unwrap_or("") {
        "" => "index.html",
        path => path,
    };
    let relative = Path::new(path);
    let safe = relative
        .components()
        .all(|component| matches!(component, Component::Normal(_)));
    let file = root.join(relative);
    if safe && file.is_file() {
        SchemeResponse::File {
            path: file.to_string_lossy().into_owned(),
            headers: Vec::new(),
        }
    } else {
        SchemeResponse::Failure(SchemeFailure::NotFound)
    }
}
