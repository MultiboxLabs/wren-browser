use std::cell::RefCell;
use std::convert::Infallible;
use std::path::{Component, Path, PathBuf};
use std::rc::{Rc, Weak};

use objc2::rc::Retained;
use objc2::runtime::{NSObject, ProtocolObject};
use objc2::{DefinedClass, MainThreadMarker, MainThreadOnly, define_class, msg_send};
use objc2_app_kit::{
    NSApplication, NSAutoresizingMaskOptions, NSBackingStoreType, NSView, NSWindow,
    NSWindowDelegate, NSWindowStyleMask,
};
use objc2_foundation::{NSObjectProtocol, NSPoint, NSRect, NSSize, NSString};
use wren::{
    App, Browser, BrowserType, ExitStatus, Keychain, MainThread, Profile, Scheme, SchemeFailure,
    SchemePrivileges, SchemeRequest, SchemeResponse, Startup, TabCrash, WebView, WebViewKind,
    WebViewOptions,
};

/// A page of the renderer, the folder `host` of src/renderer. The app serves
/// it as <scheme>://<host>/ from its bundle; a development build loads it
/// from Vite's server at <WREN_DEV_URL>/<host>/ instead.
struct Page {
    scheme: &'static str,
    host: &'static str,
    title: &'static str,
    size: (f64, f64),
    /// Its page may call the app (`wren.invoke`).
    messages: bool,
}

const UI: Page = Page {
    scheme: "app",
    host: "ui",
    title: "Wren",
    size: (1100.0, 760.0),
    messages: true,
};

const GAME: Page = Page {
    scheme: "wren",
    host: "game",
    title: "Twig & Trill",
    size: (900.0, 640.0),
    messages: false,
};

const PAGES: [&Page; 2] = [&UI, &GAME];

impl Page {
    fn url(&self) -> String {
        match dev_url() {
            Some(dev) => format!("{dev}/{}/", self.host),
            None => format!("{}://{}/", self.scheme, self.host),
        }
    }
}

fn dev_url() -> Option<String> {
    let url = std::env::var("WREN_DEV_URL").ok()?;
    Some(url.trim_end_matches('/').to_owned())
}

// The pages' schemes, each once.
fn schemes() -> Vec<&'static str> {
    let mut schemes: Vec<_> = PAGES.iter().map(|page| page.scheme).collect();
    schemes.dedup();
    schemes
}

/// A window showing one page. Its web view drops first, which takes the page
/// out of the window.
struct PageWindow {
    web_view: WebView,
    window: Retained<NSWindow>,
    // A window holds its delegate weakly.
    _delegate: Retained<WindowDelegate>,
}

impl PageWindow {
    /// `should_close` answers the window's close button.
    fn open(
        profile: &Profile,
        page: &Page,
        should_close: impl Fn() -> bool + 'static,
    ) -> Option<PageWindow> {
        let mtm = MainThreadMarker::new().unwrap();
        let options = WebViewOptions {
            kind: WebViewKind::BrowserUi,
            messages: page.messages,
            // Trust the dev server only when asked to, and only for a page
            // that needs it: a trusted origin with no option on is refused.
            trusted_origins: dev_url().filter(|_| page.messages).into_iter().collect(),
            ..Default::default()
        };
        let web_view = WebView::new(profile, &page.url(), &options)?;

        let window = unsafe {
            NSWindow::initWithContentRect_styleMask_backing_defer(
                NSWindow::alloc(mtm),
                NSRect::new(
                    NSPoint::new(0.0, 0.0),
                    NSSize::new(page.size.0, page.size.1),
                ),
                NSWindowStyleMask::Titled
                    | NSWindowStyleMask::Closable
                    | NSWindowStyleMask::Resizable
                    | NSWindowStyleMask::Miniaturizable,
                NSBackingStoreType::Buffered,
                false,
            )
        };
        unsafe { window.setReleasedWhenClosed(false) };
        window.setTitle(&NSString::from_str(page.title));
        window.center();
        let delegate = WindowDelegate::new(mtm, Box::new(should_close));
        window.setDelegate(Some(ProtocolObject::from_ref(&*delegate)));

        let content = window.contentView().unwrap();
        let view: Retained<NSView> =
            unsafe { Retained::retain(web_view.view().as_ptr().cast()) }.unwrap();
        view.setFrame(content.bounds());
        view.setAutoresizingMask(
            NSAutoresizingMaskOptions::ViewWidthSizable
                | NSAutoresizingMaskOptions::ViewHeightSizable,
        );
        content.addSubview(&view);

        // Shows the window once the page has drawn, so it never opens blank;
        // on a failed load or a crash too, or it would never open.
        let shown = window.clone();
        web_view.set_changed(Some(Box::new(move |state| {
            if (state.drawn || state.load_error != 0 || state.crash != TabCrash::None)
                && !shown.isVisible()
            {
                shown.makeKeyAndOrderFront(None);
                NSApplication::sharedApplication(MainThreadMarker::new().unwrap()).activate();
            }
        })));
        let _ = web_view.focus();

        Some(PageWindow {
            web_view,
            window,
            _delegate: delegate,
        })
    }
}

impl Drop for PageWindow {
    fn drop(&mut self) {
        self.window.setDelegate(None);
        self.window.close();
    }
}

// Hands a window's close button to the closure it was made with.
define_class!(
    #[unsafe(super(NSObject))]
    #[thread_kind = MainThreadOnly]
    #[name = "WrenWindowDelegate"]
    #[ivars = Box<dyn Fn() -> bool>]
    struct WindowDelegate;

    unsafe impl NSObjectProtocol for WindowDelegate {}

    unsafe impl NSWindowDelegate for WindowDelegate {
        #[unsafe(method(windowShouldClose:))]
        fn window_should_close(&self, _sender: &NSWindow) -> bool {
            (self.ivars())()
        }
    }
);

impl WindowDelegate {
    fn new(mtm: MainThreadMarker, should_close: Box<dyn Fn() -> bool>) -> Retained<Self> {
        let this = Self::alloc(mtm).set_ivars(should_close);
        unsafe { msg_send![super(this), init] }
    }
}

// What the app holds, shared with the closures it hands Wren.
#[derive(Default)]
struct State {
    profile: RefCell<Option<Profile>>,
    main: RefCell<Option<PageWindow>>,
    game: RefCell<Option<PageWindow>>,
}

impl State {
    fn open_main(self: &Rc<Self>, mt: MainThread) {
        let Some(profile) = self.profile.borrow().clone() else {
            return;
        };
        // Closing the main window quits the app.
        let Some(main) = PageWindow::open(&profile, &UI, move || {
            mt.quit();
            false
        }) else {
            eprintln!("Wren made no web view.");
            return mt.quit();
        };
        let state = Rc::downgrade(self);
        let _ = main.web_view.handle("game.open", move |()| {
            if let Some(state) = state.upgrade() {
                mt.later(move |_| state.open_game(mt));
            }
            Ok::<_, Infallible>(())
        });
        *self.main.borrow_mut() = Some(main);
    }

    fn open_game(self: &Rc<Self>, mt: MainThread) {
        if let Some(game) = self.game.borrow().as_ref() {
            game.window.makeKeyAndOrderFront(None);
            return;
        }
        let Some(profile) = self.profile.borrow().clone() else {
            return;
        };
        // Closing the game's window lets it close, then drops its page.
        let state: Weak<State> = Rc::downgrade(self);
        let game = PageWindow::open(&profile, &GAME, move || {
            let state = state.clone();
            mt.later(move |_| {
                if let Some(state) = state.upgrade() {
                    state.game.borrow_mut().take();
                }
            });
            true
        });
        *self.game.borrow_mut() = game;
    }
}

// Answers <scheme>://<host>/<path> for a page: its own files are in
// <root>/<host>, and the files the pages share in <root>/assets.
fn serve_page(request: SchemeRequest, root: &Path) {
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
fn renderer_root() -> PathBuf {
    let executable = std::env::current_exe().unwrap();
    let contents = executable.parent().and_then(Path::parent).unwrap();
    contents.join("Resources/renderer")
}

struct Wren(Rc<State>);

impl App for Wren {
    fn ready(&self, mt: MainThread) {
        let root = Rc::new(renderer_root());
        for scheme in schemes() {
            let root = root.clone();
            let _ = mt.set_scheme_handler(
                scheme,
                Some(Box::new(move |request| serve_page(request, &root))),
            );
        }
        // The pages get a Profile of their own, so their storage is not
        // among the user's sites'.
        let state = self.0.clone();
        mt.create_ephemeral_profile(move |result| match result {
            Ok(profile) => {
                *state.profile.borrow_mut() = Some(profile);
                state.open_main(mt);
            }
            Err(_) => mt.quit(),
        });
    }

    // Required: Chromium opened a Browser of its own (a popup, DevTools).
    // This app shows no Browsers yet, so it closes them.
    fn browser_opened(&self, _: MainThread, opened: Browser, _: BrowserType, _: Option<Browser>) {
        let _ = opened.close();
    }
}

fn main() {
    let data = format!(
        "{}/Library/Application Support/dev.multibox.wren",
        std::env::var("HOME").unwrap()
    );
    let mut startup = Startup::new(data, Keychain::Mock);
    startup.schemes = schemes()
        .into_iter()
        .map(|scheme| {
            Scheme::new(
                scheme,
                SchemePrivileges::STANDARD | SchemePrivileges::SECURE | SchemePrivileges::FETCH,
            )
        })
        .collect();
    let state = Rc::new(State::default());
    let status = wren::run(startup, Wren(state.clone()));
    // Drops the pages and their windows before the process ends.
    drop(state);
    std::process::exit(if status == ExitStatus::Normal {
        0
    } else {
        status as i32
    });
}
