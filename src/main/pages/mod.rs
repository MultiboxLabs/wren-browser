// The renderer's pages, all on the app's scheme, and serving them.

#[cfg(debug_assertions)]
mod dev_server;
mod embedded;
pub mod icons;

use wren::{SchemeFailure, SchemeRequest, SchemeResponse};

pub const SCHEME: &str = "wren";

/// A page of the renderer, src/renderer/pages/<host>, shown as
/// wren://<host>/.
pub struct Page {
    pub host: &'static str,
    /// Its page may call the app (`wren.invoke`).
    pub messages: bool,
    /// Its page may show tabs and side panels (`<wren-view>`).
    pub embeds_views: bool,
    /// Its page may mark elements for Chromium's bubbles to hang off
    /// (`<embed type="application/x-wren-anchor">`).
    pub anchors: bool,
    /// A tab may load it (a typed address); otherwise only the app's own web
    /// views get it.
    pub in_tabs: bool,
}

pub const UI: Page = Page {
    host: "ui",
    messages: true,
    embeds_views: true,
    anchors: true,
    in_tabs: false,
};

pub const GAME: Page = Page {
    host: "game",
    messages: false,
    embeds_views: false,
    anchors: false,
    in_tabs: true,
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
    /// The renderer compiled into the executable, so it is covered by the
    /// app's code signature.
    Embedded,
    /// Vite's dev server, at this address. Debug builds only: a release build
    /// has no code to reach it.
    #[cfg(debug_assertions)]
    DevServer(String),
}

impl Source {
    /// The dev server named by WREN_DEV_URL, in a debug build only: a
    /// shipped app serves only what it carries.
    pub fn from_env() -> Source {
        #[cfg(debug_assertions)]
        if let Ok(url) = std::env::var("WREN_DEV_URL") {
            return Source::DevServer(url.trim_end_matches('/').to_owned());
        }
        Source::Embedded
    }

    /// Chromium switches for pages from the dev server: Local Network
    /// Access would refuse their live updates from localhost, as a web view
    /// cannot ask, and their console goes to the terminal.
    pub fn development_switches(&self) -> Vec<String> {
        match self {
            Source::Embedded => Vec::new(),
            #[cfg(debug_assertions)]
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
    let Some(page) = PAGES.iter().find(|page| page.host == host) else {
        let _ = request.respond(SchemeResponse::Failure(SchemeFailure::NotFound));
        return;
    };
    if !page.in_tabs && request.web_view().is_none() {
        let _ = request.respond(SchemeResponse::Failure(SchemeFailure::AccessDenied));
        return;
    }
    let path = path.split('#').next().unwrap_or("");
    // The UI's icons come from the app, whatever serves its files.
    if page.host == UI.host
        && let Some(name) = path.strip_prefix(icons::PATH)
    {
        let _ = request.respond(icons::serve(name));
        return;
    }
    match source {
        #[cfg(debug_assertions)]
        Source::DevServer(server) => dev_server::proxy(request, format!("{server}/{path}")),
        Source::Embedded => {
            let _ = request.respond(embedded::file(path));
        }
    }
}
