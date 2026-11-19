// Wren Runtime's callbacks. Each finds the part an event is for and calls
// it, and decides nothing itself. What runs once Chromium's call is over
// (`MainThread::later`) is the part's to put off, as the call allows no
// change to a Browser, a tab or a popover.

use std::rc::Rc;

use wren::{
    App, Browser, BrowserType, Change, ChangeKind, MainThread, PopoverAnswer, PopoverKind,
    PopoverRequest, ProfileExtensionsRequest, QuitPrompt, WindowRequest,
};

use super::{State, commands};
use crate::extensions::{self, components};
use crate::import;
use crate::ipc::{self, changes};
use crate::menus;
use crate::pages::{SCHEME, Source, serve_page};
use crate::platform::RunningApp;
use crate::profiles::{self, filling};
use crate::sidebar::items;
use crate::tabs;
use crate::windows;

pub struct Wren {
    pub state: Rc<State>,
    pub source: Source,
}

impl App for Wren {
    fn ready(&self, mt: MainThread) {
        menus::update_main_menu(&self.state, mt);
        self.state.check_default_browser(mt);
        components::ready(mt);
        ipc::handle_migrate(mt, &self.state);
        ipc::watch_tab_switcher_keys(&self.state);
        let source = self.source.clone();
        let _ = mt.set_scheme_handler(
            SCHEME,
            Some(Box::new(move |request| serve_page(request, &source))),
        );
        // The pages get a Profile of their own, so their storage is not
        // among the user's sites'.
        let state = self.state.clone();
        mt.create_ephemeral_profile(move |result| match result {
            Ok(profile) => {
                *state.ui_profile.borrow_mut() = Some(profile);
                state.start(mt);
            }
            Err(_) => mt.quit(),
        });
    }

    // Which of the app's extensions a profile gets (extensions/mod.rs).
    fn profile_extensions(&self, request: &mut ProfileExtensionsRequest) {
        extensions::for_profile(&self.state, request);
    }

    // Required: Chromium opened a Browser of its own. A normal one, a
    // restored window or one a link or the omnibox asked for, is shown in a
    // window of its own, on the space it came from, or an incognito one on
    // its profile's off-the-record side (`place_opened`). DevTools gets a
    // plain window of its own (windows/devtools.rs), and the rest (a popup,
    // an app's window) a Mini Wren (`open_popup`).
    fn browser_opened(
        &self,
        mt: MainThread,
        opened: Browser,
        kind: BrowserType,
        opener: Option<Browser>,
    ) {
        match kind {
            BrowserType::Normal => self.state.place_opened(mt, opened, opener),
            BrowserType::Devtools => self.state.devtools.opened(opened),
            _ => self.state.open_popup(mt, opened, opener),
        }
    }

    fn changed(&self, mt: MainThread, changes: &[Change]) {
        let state = &self.state;
        if changes
            .iter()
            .any(|change| change.kind == ChangeKind::Profiles)
        {
            profiles::list_changed(state, mt);
        }
        // Warn Before Quitting's item is checked as the setting is, which
        // Chrome's settings page and Always Quit change too.
        if changes
            .iter()
            .any(|change| change.kind == ChangeKind::QuitWarning)
        {
            menus::update_main_menu(state, mt);
        }
        // Here, in System Settings, or on Chromium's settings page.
        if changes
            .iter()
            .any(|change| change.kind == ChangeKind::DefaultBrowser)
        {
            state.check_default_browser(mt);
        }
        // Before anything below tells a page of its tabs.
        for window in state.windows.all() {
            changes::forget_changed(&window, changes);
        }
        for change in changes {
            tabs::record_crash(state, change);
            if let Some(profile) = &change.profile {
                match change.kind {
                    ChangeKind::ProfileOpened => profiles::opened(profile),
                    ChangeKind::ProfileClosed => filling::closed(&profile.id()),
                    ChangeKind::Autofill => filling::autofill_changed(state, mt, profile),
                    _ => {}
                }
            }
            // Its ad blocker may have been turned on or off, and an extension
            // brought over may now take its pin.
            if change.kind == ChangeKind::Extensions
                && let Some(profile) = &change.profile
            {
                ipc::broadcast_ad_block(state, profile);
                import::pin_waiting_extensions(profile);
            }
            let Some(browser) = &change.browser else {
                continue;
            };
            match change.kind {
                ChangeKind::ForegroundRequest => windows::foreground_requested(state, browser),
                // Undocked DevTools shows its active tab.
                ChangeKind::Tabs | ChangeKind::Tab | ChangeKind::Split => {
                    tabs::changed(state, browser, change);
                    state.devtools.tabs_changed(browser);
                }
                _ => {}
            }
        }
        for window in self.state.windows.all() {
            if changes::apply(&window, changes) {
                state.update_title(&window);
            }
            // A Mini Wren's page may have gone to the New Tab page, or left
            // it.
            state.follow_new_tab_page(mt, &window);
        }
        // A dialog opened or closed, or another Browser came in front, as
        // a switch makes one active and another not.
        if changes
            .iter()
            .any(|change| matches!(change.kind, ChangeKind::ModalDialog | ChangeKind::Active))
        {
            menus::update_front_menu(state, mt);
        }
    }

    // A main menu command (commands.rs).
    fn menu_command(&self, mt: MainThread, id: &str, browser: Option<Browser>) {
        commands::menu_command(&self.state, mt, id, browser);
    }

    // Toasts and the find bar are the page's: the toast at the window's top
    // right, Chromium's and the app's own alike (ipc/toast.rs), and the bar
    // at the active tab's (ipc/find.rs). The zoom is a toast of the app's
    // instead. A page's request for permissions is the page's too, a prompt
    // off its page info button (ipc/permission.rs), and the download bubble
    // is its shelf or Library (ipc/downloads.rs). The rest of Chromium's
    // popovers are its own still.
    fn popover(&self, mt: MainThread, request: &PopoverRequest) -> PopoverAnswer {
        let state = &self.state;
        match request.kind {
            PopoverKind::Zoom => ipc::show_zoom_bubble(mt, request),
            PopoverKind::Downloads => ipc::show_downloads_bubble(state, mt, request),
            PopoverKind::Permission => ipc::show_permission_prompt(state, mt, request),
            PopoverKind::Toast => ipc::show_requested_toast(state, mt, request),
            PopoverKind::Find => ipc::show_find_bar(state, mt, request),
            _ => PopoverAnswer::Chromium,
        }
    }

    // Chromium wants the address field, as a New Tab page given the
    // keyboard does (ipc/omnibox.rs).
    fn focus_location_bar(&self, _: MainThread, browser: Browser) {
        ipc::focus_location_bar(&self.state, &browser);
    }

    // A page wants the whole window, or is done with it (windows/request.rs).
    fn fullscreen(&self, mt: MainThread, browser: Browser, fullscreen: bool) -> bool {
        windows::fullscreen(&self.state, mt, &browser, fullscreen)
    }

    // Chromium asks for a Browser's window to move, resize, minimise, zoom
    // or come back to normal (windows/request.rs).
    fn window_request(&self, _: MainThread, browser: Browser, request: WindowRequest) {
        self.state.answer_window_request(&browser, request);
    }

    // ⌘Q warns in the page of the window in front, in place of Chromium's
    // "Hold ⌘Q to Quit".
    fn quit_prompt(&self, mt: MainThread, prompt: &QuitPrompt) -> PopoverAnswer {
        ipc::show_quit_prompt(&self.state, mt, prompt)
    }

    // The quit can no longer be cancelled: every window goes off the screen
    // now, before Chromium closes its Browsers, which would empty it one
    // space at a time. Each is still kept, to come back at the next launch.
    // A relaunch with an update ready installs it first (updates.rs).
    fn quit_committed(&self, mt: MainThread) {
        for window in self.state.windows.all() {
            window.page.hide();
        }
        self.state.updates.quit_committed(mt);
    }

    // Chromium's Settings, About among its pages, as it opens.
    fn update_check(&self, _: MainThread) {
        self.state.updates.about_asked();
    }

    // Each window open now comes back where it is.
    fn will_quit(&self, _: MainThread) {
        for window in self.state.windows.all() {
            self.state.save_frame(&window);
        }
        self.state.analytics.quit();
    }

    // The Dock icon, with no window open: a new one; or onboarding, until
    // the user is through it.
    fn reopen(&self, mt: MainThread, _: bool) {
        if let Some(onboarding) = self.state.onboarding() {
            return onboarding.bring_forward();
        }
        if self.state.windows.len() == 0 {
            self.state.open_recent_window(mt);
        }
    }

    // A link clicked in another app while Wren is the default browser, or a
    // page opened with it: a Mini Wren each (windows/open_urls.rs).
    fn open_urls(&self, mt: MainThread, urls: &[String]) {
        // TODO: take the sender from Wren Runtime's next version, which
        // gives its app_id, app_name and app_path with the URLs. Until then
        // every link is Discord's.
        let sender = RunningApp {
            id: "com.hnc.Discord".into(),
            name: "Discord".into(),
        };
        self.state.open_urls(mt, urls, Some(sender));
    }

    // Chromium closes a Browser whose last tab closes. Its window stays, with
    // the space empty, unless the user is closing the window: that goes with
    // its last Browser, and the app with the last window where it quits so.
    // A window on a profile stays too: at quit, each Browser closes before
    // the app hears of the quit, and the window must be kept. One whose
    // profile was deleted goes with it (`State::leave_gone_profiles`). A

    // A Browser closed: its tabs are forgotten, and its window, of undocked
    // DevTools or the app's own, does what it does as one goes
    // (windows/close.rs).
    fn browser_closed(&self, mt: MainThread, browser: Browser) {
        tabs::roles::forget_closed();
        items::carry::forget_gone();
        tabs::closes::forget_gone();
        tabs::previews::forget(&browser);
        if self.state.devtools.closed(&browser) {
            return;
        }
        windows::browser_closed(&self.state, mt, &browser);
    }
}
