// The renderer's pages, all on the app's scheme, and serving them.

#[cfg(debug_assertions)]
mod dev_server;
mod embedded;
pub mod icons;
pub mod previews;

use wren::{
    Profile, SchemeFailure, SchemeRequest, SchemeResponse, WebView, WebViewKind, WebViewOptions,
};

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
    /// Its page's `wheel` events say where a trackpad scroll is: the fingers
    /// landing, moving and lifting, and its glide after (`wrenPhase`).
    pub wheel_phases: bool,
}

pub const UI: Page = Page {
    host: "ui",
    messages: true,
    embeds_views: true,
    anchors: true,
    in_tabs: false,
    wheel_phases: true,
};

pub const GAME: Page = Page {
    host: "game",
    messages: false,
    embeds_views: false,
    anchors: false,
    in_tabs: true,
    wheel_phases: false,
};

const PAGES: [&Page; 2] = [&UI, &GAME];

impl Page {
    pub fn url(&self) -> String {
        format!("{SCHEME}://{}/", self.host)
    }

    /// A web view of the page in `profile`, for a window of the app's own
    /// (`platform::PageWindow`): the browser's UI, see-through where the
    /// page draws nothing, and dragging the window where the page lets it.
    /// A click there, a press that does not move, is still the page's.
    pub fn web_view(&self, profile: &Profile) -> Option<WebView> {
        let options = WebViewOptions {
            kind: WebViewKind::BrowserUi,
            // Only Toggle UI Devtools opens the UI's DevTools, not Inspect.
            disallow_user_devtools_activation: true,
            messages: self.messages,
            embeds_views: self.embeds_views,
            anchors: self.anchors,
            wheel_phases: self.wheel_phases,
            drags_window: true,
            drag_area_clicks: true,
            transparent: true,
            ..Default::default()
        };
        WebView::new(profile, &self.url(), &options)
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

// Answers wren://<host>/<path> for a page. Its address with no path is its
// entry, pages/<host>/index.html in the renderer.
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
    // Another page's files are not this one's: a tab must not show the UI's
    // page on the game's address.
    if let Some(rest) = path.strip_prefix("pages/")
        && !rest.starts_with(&format!("{host}/"))
    {
        let _ = request.respond(SchemeResponse::Failure(SchemeFailure::NotFound));
        return;
    }
    let entry;
    let path = if path.is_empty() || path.starts_with('?') {
        entry = format!("pages/{host}/index.html{path}");
        &entry
    } else {
        path
    };
    // The UI's icons and tabs' previews come from the app, whatever serves
    // its files.
    if page.host == UI.host
        && let Some(name) = path.strip_prefix(icons::PATH)
    {
        let _ = request.respond(icons::serve(name));
        return;
    }
    if page.host == UI.host
        && let Some(name) = path.strip_prefix(previews::PATH)
    {
        let _ = request.respond(previews::serve(name));
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
