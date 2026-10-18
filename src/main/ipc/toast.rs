// The toast showing: Chromium's ("Link copied") or the app's own (Copy
// URL's), which come through the Browser's toast queue alike. The app
// answers their requests with its own (`App::popover`), which the page draws
// (pages/ui/toast.tsx); Chromium still decides when each goes.

use serde::{Deserialize, Serialize};
use wren::unstable_ui::UIText;
use wren::{Browser, Error, Popover, PopoverKind, WebView};

use super::{WindowRef, failed, png_url, with_browser};
use crate::window::BrowserWindow;

// What Chromium names every toast of the app's.
const EMBEDDER: &str = "Embedder";

/// The app's own toasts.
#[derive(Clone, Copy)]
pub enum OwnToast {
    UrlCopied,
}

impl OwnToast {
    const ALL: [OwnToast; 1] = [OwnToast::UrlCopied];

    fn text(self) -> &'static str {
        match self {
            OwnToast::UrlCopied => "Copied Current URL",
        }
    }

    // Its name for the page, which draws its icon by it, as by Chromium's
    // names for its own.
    fn name(self) -> &'static str {
        match self {
            OwnToast::UrlCopied => "UrlCopied",
        }
    }
}

/// The toast as the page draws it.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Toast {
    /// The request's, which "toast.press" and "toast.close" name.
    id: u64,
    /// Chromium's name for it ("LinkCopied", "AddedToReadingList"), or the
    /// app's for one of its own ("UrlCopied").
    name: String,
    text: String,
    /// Its button's text, if it has one.
    button: Option<String>,
    /// Chromium's icon, as a PNG data: URL, for a toast the page has none of
    /// its own for; None with a spinner in its place.
    icon: Option<String>,
    /// Something is under way: a spinner in place of its icon.
    busy: bool,
}

/// The toast's request, as the page names it.
#[derive(Deserialize)]
struct Named {
    id: u64,
}

pub fn handle(web_view: &WebView, window: &WindowRef) {
    // The toast showing, or null; "toast.state" says when it changes.
    let weak = window.clone();
    let _ = web_view.handle("toast.state", move |()| {
        with_browser(&weak, |_, browser| Ok(toast(browser)))
    });

    // Its button, as Chrome's: it does what it says, and the toast goes.
    let weak = window.clone();
    let _ = web_view.handle("toast.press", move |named: Named| {
        with_browser(&weak, |_, browser| {
            named.find(browser)?.press_toast_button().map_err(failed)
        })
    });

    // A click on it: it goes before Chromium's time for it is up.
    let weak = window.clone();
    let _ = web_view.handle("toast.close", move |named: Named| {
        with_browser(&weak, |_, browser| {
            named.find(browser)?.close().map_err(failed)
        })
    });
}

impl Named {
    // The toast, if it is still the one showing.
    fn find(&self, browser: &Browser) -> Result<Popover, String> {
        open(browser)
            .filter(|popover| popover.id() == self.id)
            .ok_or_else(|| "The toast has gone.".into())
    }
}

/// Shows one of the app's toasts, as Chromium shows its own.
pub fn show_toast(browser: &Browser, toast: OwnToast) -> Result<(), Error> {
    browser.show_toast(toast.text(), None)
}

/// Tells the page a toast came or went.
pub fn send_toast(window: &BrowserWindow, browser: &Browser) {
    let _ = window.page.web_view.send("toast.state", &toast(browser));
}

fn open(browser: &Browser) -> Option<Popover> {
    browser.open_popover(PopoverKind::Toast)
}

fn toast(browser: &Browser) -> Option<Toast> {
    let popover = open(browser)?;
    let state = popover.toast_state().ok()?;
    let text = popover.text(UIText::Title);
    let mut name = popover.toast_name();
    if name == EMBEDDER
        && let Some(own) = OwnToast::ALL.into_iter().find(|own| own.text() == text)
    {
        name = own.name().into();
    }
    Some(Toast {
        id: popover.id(),
        name,
        button: state
            .has_button
            .then(|| popover.text(UIText::Accept))
            .filter(|label| !label.is_empty()),
        icon: popover.toast_icon_png(16, 2.0).map(png_url),
        busy: state.has_throbber,
        text,
    })
}
