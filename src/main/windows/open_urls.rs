// What macOS asks the app to open: a link clicked in another app while Wren
// is the default browser, or a page opened with it. Each opens in a Mini
// Wren of its own (mini_wren/from_apps.rs), which goes back to the app that sent it as
// it closes.

use std::rc::Rc;

use wren::{MainThread, OpenURLsRequest, OpenURLsSource};

use super::mini_wren::HeldMiniWren;
use crate::app::State;
use crate::platform::RunningApp;
use crate::windows;

/// Opens `request`'s URLs in Mini Wren, now or once the app can, going back
/// to the app that sent them as each closes if it is known.
pub fn open_urls(state: &Rc<State>, mt: MainThread, request: &OpenURLsRequest) {
    let return_to = sender(request);
    let pages = request.urls.iter().map(|url| HeldMiniWren {
        url: url.clone(),
        return_to: return_to.clone(),
    });
    windows::mini_wren::hold(state, mt, pages);
}

fn sender(request: &OpenURLsRequest) -> Option<RunningApp> {
    if request.source != OpenURLsSource::App {
        return None;
    }
    let id = request.app_id.clone()?;
    let name = request.app_name.clone().unwrap_or_else(|| id.clone());
    Some(RunningApp { id, name })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn request(
        source: OpenURLsSource,
        app_id: Option<&str>,
        app_name: Option<&str>,
    ) -> OpenURLsRequest {
        OpenURLsRequest {
            urls: vec!["https://example.com".into()],
            source,
            app_id: app_id.map(Into::into),
            app_name: app_name.map(Into::into),
            app_path: None,
        }
    }

    #[test]
    fn takes_the_sending_app_only_from_an_app_with_an_id() {
        let app = sender(&request(
            OpenURLsSource::App,
            Some("com.example.App"),
            Some("Example"),
        ))
        .unwrap();
        assert_eq!(
            (app.id.as_str(), app.name.as_str()),
            ("com.example.App", "Example")
        );

        let unnamed = sender(&request(OpenURLsSource::App, Some("com.example.App"), None)).unwrap();
        assert_eq!(unnamed.name, "com.example.App");

        assert!(sender(&request(OpenURLsSource::App, None, Some("tool"))).is_none());
        assert!(
            sender(&request(
                OpenURLsSource::Handoff,
                Some("com.example.App"),
                None
            ))
            .is_none()
        );
        assert!(
            sender(&request(
                OpenURLsSource::Unknown,
                Some("com.example.App"),
                None
            ))
            .is_none()
        );
    }
}
