// The app's state and Wren's callbacks.

use std::cell::{Cell, RefCell};
use std::collections::HashMap;
use std::path::PathBuf;
use std::rc::Rc;

use wren::{
    App, Browser, BrowserType, Change, ChangeKind, DefaultBrowserState, MainThread, PopoverAnswer,
    PopoverKind, PopoverRequest, PopoverTrigger, Profile, ProfileExtensionsRequest, ProfileKind,
    QuitPrompt, TabFields, WindowRequest,
};

use crate::analytics::{self, Analytics, Event};
use crate::changes;
use crate::channel::Channel;
use crate::db::Db;
use crate::extensions::{ad_block, components};
use crate::filling;
use crate::import;
use crate::ipc::{self, OmniboxTarget, OwnToast};
use crate::items;
use crate::menus;
use crate::pages::{self, SCHEME, Source, serve_page};
use crate::perf::Perf;
use crate::pins;
use crate::platform::{
    DevToolsWindow, KeyWatch, PageWindow, QUITS_WITH_LAST_WINDOW, close_other_key_window,
};
use crate::shell::{BrowserWindow, WindowId, Windows};
use crate::sidebar::SidebarStore;
use crate::tabs::{self, placeholder};
use crate::updates::{self, Updates};
use crate::windows::{self, LinkSender};

// What the app holds, shared with the closures it hands Wren.
pub struct State {
    // The pages', not the user's.
    pub(crate) ui_profile: RefCell<Option<Profile>>,
    devtools: RefCell<HashMap<Browser, DevToolsWindow>>,
    pub windows: Windows,
    // What the pages keep between runs, in `data`; all windows share it.
    pub sidebar: SidebarStore,
    /// What the app keeps of its own, spaces for now.
    pub db: Db,
    pub analytics: Analytics,
    /// Profiles whose last session is being restored (windows/session.rs).
    pub(crate) restoring: Cell<u32>,
    /// The sidebar's performance run, if this is one.
    pub perf: Option<Perf>,
    /// The warning before quitting a window's page shows (ipc/quit.rs).
    pub quit_prompt: RefCell<Option<ipc::OpenQuitPrompt>>,
    /// The window whose tab switcher is open, while ⌃ is held
    /// (ipc/tab_switcher.rs).
    pub tab_switcher: Cell<Option<WindowId>>,
    /// The onboarding window, while the user goes through it, before the
    /// app starts (onboarding.rs).
    pub(crate) onboarding: RefCell<Option<Rc<PageWindow>>>,
    /// What the main menu has the window in front allow, as it was set last
    /// (windows/mod.rs).
    pub(crate) menu_front: Cell<menus::Front>,
    // Hears the tab switcher's keys while it is kept.
    tab_switcher_keys: RefCell<Option<KeyWatch>>,
    /// The app's own updates (updates.rs).
    pub updates: Updates,
    /// Links macOS asked the app to open before it could, each with the app
    /// that sent it (windows/open_urls.rs).
    pub(crate) held_links: RefCell<Vec<(String, Option<LinkSender>)>>,
    /// The app's own pages to show in tabs, held until the window links
    /// open in has its Browser (windows/open_urls.rs).
    pub(crate) held_pages: RefCell<Vec<String>>,
    /// The app each Mini Wren a link opened goes back to as it closes: the
    /// one that sent the link, until the user goes to another window
    /// (windows/open_urls.rs).
    pub(crate) returns_to: RefCell<HashMap<WindowId, LinkSender>>,
    /// Whether Wren is the default browser, as macOS said last; none before
    /// it says (windows/mod.rs).
    pub(crate) default_browser: Cell<Option<DefaultBrowserState>>,
}

impl State {
    pub fn new(data: PathBuf, channel: Channel, perf: Option<Perf>) -> State {
        let db = Db::open(&data);
        let settings = db.settings().unwrap_or_default();
        filling::start(&settings);
        let on = settings.share_usage_data;
        // The one place that notes the version: noting it forgets the last.
        let updated_from = db.note_version(updates::VERSION).unwrap_or_else(|error| {
            eprintln!("Wren could not note its version: {error}");
            None
        });
        let updates = Updates::new(updated_from.is_some());
        let analytics = Analytics::start(&db, &data, channel, perf.is_some(), on, updated_from);
        State {
            ui_profile: RefCell::default(),
            devtools: RefCell::default(),
            windows: Windows::default(),
            sidebar: SidebarStore::new(&data),
            db,
            analytics,
            restoring: Cell::new(0),
            perf,
            quit_prompt: RefCell::default(),
            tab_switcher: Cell::default(),
            onboarding: RefCell::default(),
            menu_front: Cell::new(menus::Front {
                switching: true,
                blocked: false,
                popup: false,
            }),
            tab_switcher_keys: RefCell::default(),
            updates,
            held_links: RefCell::default(),
            held_pages: RefCell::default(),
            returns_to: RefCell::default(),
            default_browser: Cell::default(),
        }
    }

    // Opens the windows open at the last quit, or else the first window, then
    // the user's own Profile, the one Chromium starts with, and each profile
    // they wait for, with the tabs they had (windows/session.rs). Onboarding
    // comes first, until the user has been through it; it calls this again
    // once they have. A performance run has none.
    pub(crate) fn start(self: &Rc<Self>, mt: MainThread) {
        if self.perf.is_none() && !self.db.onboarded() {
            if !self.open_onboarding(mt) {
                eprintln!("Wren could not open onboarding.");
                mt.quit();
            }
            return;
        }
        // The database has each profile, and the app a space, before anything
        // shows them. The list is read again once the first profile is open,
        // in case it was not filled yet.
        self.db.sync_profiles(&mt.profile_list());
        if !self.open_saved_windows(mt) {
            self.open_window(mt, None);
        }
        if self.windows.len() == 0 {
            eprintln!("Wren made no web view.");
            return mt.quit();
        }
        self.updates.start(self, mt);
        tabs::archive::start(mt, self);
        // Restoring from now, while the profile opens: the windows wait for
        // their Browsers, which a link must not make first (open_urls.rs).
        self.restore_started();
        let state = self.clone();
        mt.open_profile(None, move |result| match result {
            Ok(profile) => {
                if state.db.sync_profiles(&mt.profile_list()) {
                    ipc::broadcast_spaces(&state);
                }
                // A kept window on a profile deleted since goes.
                state.leave_gone_profiles(mt);
                state.update_menu(mt);
                state.restore_sessions(mt, profile);
                state.restore_finished(mt);
            }
            Err(error) => {
                eprintln!("Wren opened no Profile: {error:?}");
                mt.quit();
            }
        });
    }

    // The close button of window `id`. Where the last window quits the app
    // (not on a Mac), it is kept with its session for the next run. Any
    // other is forgotten, and leaves by closing its Browsers, as Chrome's
    // does, and goes once they have. A page's "Leave site?" may keep them
    // all open, and the window with them, still kept.
    pub(crate) fn close_window(self: &Rc<Self>, mt: MainThread, id: WindowId) {
        if QUITS_WITH_LAST_WINDOW && self.windows.len() <= 1 {
            return mt.quit();
        }
        let Some(window) = self.windows.get(id) else {
            return;
        };
        ipc::quit_window_closing(self, id);
        // A move its page asks about waits for an answer that can't come now.
        ipc::forget_move_question(id);
        if window.has_browsers() {
            let state = Rc::downgrade(self);
            let closed = window.clone();
            return window.close_browsers(move || {
                if let Some(state) = state.upgrade() {
                    state.forget_window(&closed);
                }
            });
        }
        self.forget_window(&window);
        // It has no Browser to close, and is not dropped inside its own
        // delegate's call.
        let state = Rc::downgrade(self);
        mt.later(move |_| {
            if let Some(state) = state.upgrade() {
                state.windows.remove(id);
            }
        });
    }

    // Toggle UI DevTools: closes `page`'s DevTools if they are open, or
    // opens them. Each window's page has its own, and a site's DevTools
    // stays open.
    fn toggle_ui_devtools(page: &PageWindow) {
        let web_view = &page.web_view;
        let open = web_view.state().is_ok_and(|state| state.devtools);
        let result = if open {
            web_view.close_dev_tools()
        } else {
            web_view.open_dev_tools()
        };
        if let Err(error) = result {
            eprintln!("Wren could not toggle UI DevTools: {error:?}");
        }
    }

    // Reload UI: reloads `page`, not its window's tabs.
    fn reload_ui(page: &PageWindow) {
        if let Err(error) = page.web_view.reload() {
            eprintln!("Wren could not reload the UI: {error:?}");
        }
    }

    // ⌘W: the omnibox for a new tab, as if it were that tab; else the space
    // the user makes, which the window comes back from; else the active tab;
    // or, with none of its own, the window, as Chrome's goes with its last
    // tab.
    fn close_tab(self: &Rc<Self>, mt: MainThread, window: &BrowserWindow) {
        if window.has_new_tab_omnibox() {
            return ipc::send_close_omnibox(window);
        }
        if window.left_space().is_some() {
            if let Err(error) = self.cancel_new_space(window.id) {
                eprintln!("Wren could not leave the new space: {error}");
            }
            return;
        }
        let active = window
            .browser_with_tabs()
            .and_then(|browser| Some((browser.active_tab()?, browser)));
        match active {
            // A pin's tab closes with the rest of the pin's, if it is a
            // split's, and leaves the pin unopened.
            Some((tab, browser)) => match tabs::roles::pin_of(tab) {
                Some(pin) => {
                    let _ = pins::close(self, &browser, pin);
                }
                None => {
                    let _ = tabs::closes::close(&browser, tab, analytics::TabFrom::Command);
                }
            },
            None => self.close_window(mt, window.id),
        }
    }
}

pub struct Wren {
    pub state: Rc<State>,
    pub source: Source,
}

impl Wren {
    // A main menu command in a popup's window. The popup closes, and copies
    // its address, as any window does. New Tab and Open Location both open
    // its own omnibox, for its page, if it shows an address: a popup has
    // one page, so what is chosen opens there. In a popup with no address
    // they go to the window the user browses in, which comes forward for
    // the omnibox, as New Window does always, and as Chrome's in a popup go
    // to its last tabbed window. The rest are for a window's tabs, sidebar
    // and spaces, which a popup has none of.
    fn popup_command(&self, mt: MainThread, id: &str, popup: &BrowserWindow) {
        let state = &self.state;
        let front = state.windows.front();
        match id {
            menus::CLOSE_TAB | menus::CLOSE_WINDOW => state.close_window(mt, popup.id),
            menus::COPY_URL => {
                if let Some(browser) = popup.browser() {
                    let _ = tabs::copy_url(&browser);
                }
            }
            menus::OPEN_AS_TAB => {
                if let Err(error) = state.open_popup_as_tab(mt, popup.id, None) {
                    eprintln!("Wren could not open the popup's page as a tab: {error}");
                }
            }
            // In the browser window: a popup's has no Library.
            menus::SHOW_DOWNLOADS => {
                if let Some(front) = front {
                    front.page.bring_forward();
                    ipc::send_reveal(&front, None);
                }
            }
            menus::SHOW_SETTINGS => {
                if let Some(front) = front {
                    front.page.bring_forward();
                    ipc::send_show_settings(&front);
                }
            }
            menus::NEW_TAB | menus::OPEN_LOCATION
                if popup.popup().is_some_and(|popup| popup.address) =>
            {
                ipc::send_show_omnibox(popup, OmniboxTarget::Current, true);
            }
            menus::NEW_WINDOW => state.new_window(mt, front.as_deref()),
            menus::NEW_INCOGNITO_WINDOW => state.new_incognito_window(mt, front.as_deref()),
            menus::NEW_TAB | menus::OPEN_LOCATION => {
                let Some(front) = front else { return };
                front.page.bring_forward();
                let target = match id {
                    menus::NEW_TAB => OmniboxTarget::NewTab,
                    _ => OmniboxTarget::Current,
                };
                ipc::send_show_omnibox(&front, target, true);
            }
            _ => {}
        }
    }
}

impl App for Wren {
    fn ready(&self, mt: MainThread) {
        self.state.update_menu(mt);
        self.state.check_default_browser(mt);
        components::ready(mt);
        ipc::handle_migrate(mt, &self.state);
        *self.state.tab_switcher_keys.borrow_mut() = ipc::watch_tab_switcher_keys(&self.state);
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

    // The app's extensions (the ad blocker and Wren Components), in every
    // profile but the pages', the one ephemeral profile. The ad blocker
    // starts on in a new profile as the setting says.
    fn profile_extensions(&self, request: &mut ProfileExtensionsRequest) {
        let gets = request.kind != ProfileKind::Ephemeral;
        for extension in &mut request.extensions {
            extension.gets = gets;
        }
        let settings = self.state.db.settings();
        let block_ads = settings.map_or(true, |settings| settings.block_ads_in_new_profiles);
        ad_block::on_install(request, block_ads);
    }

    // Required: Chromium opened a Browser of its own. A normal one, a
    // restored window or one a link or the omnibox asked for, is shown in a
    // window of its own, on the space it came from, or an incognito one on
    // its profile's off-the-record side (`place_opened`). DevTools gets a
    // plain window of its own, and the rest (a popup, an app's window) a
    // popup's window (`open_popup`).
    fn browser_opened(
        &self,
        mt: MainThread,
        opened: Browser,
        kind: BrowserType,
        opener: Option<Browser>,
    ) {
        match kind {
            BrowserType::Normal => self.state.place_opened(mt, opened, opener),
            BrowserType::Devtools => {
                let window = DevToolsWindow::new(opened.clone());
                self.state.devtools.borrow_mut().insert(opened, window);
            }
            _ => self.state.open_popup(mt, opened, opener),
        }
    }

    fn changed(&self, mt: MainThread, changes: &[Change]) {
        let state = &self.state;
        if changes
            .iter()
            .any(|change| change.kind == ChangeKind::Profiles)
        {
            // A profile deleted elsewhere takes its spaces and windows with
            // it. One renamed is told too: the page and the main menu show
            // profiles' names.
            if state.db.sync_profiles(&mt.profile_list()) {
                state.leave_gone_spaces(None);
            }
            state.leave_gone_profiles(mt);
            ipc::broadcast_spaces(state);
        }
        // Warn Before Quitting's item is checked as the setting is, which
        // Chrome's settings page and Always Quit change too.
        if changes
            .iter()
            .any(|change| change.kind == ChangeKind::QuitWarning)
        {
            state.update_menu(mt);
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
            record_tab_crash(state, change);
            if let Some(profile) = &change.profile {
                match change.kind {
                    ChangeKind::ProfileOpened => {
                        filling::opened(profile);
                        windows::keep_session_data(profile);
                    }
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
                // A restore asks for the Browser Chromium had active to come
                // forward, which would take the window off the space it was
                // kept on: its request is forgotten, and Chromium's next is
                // reported.
                ChangeKind::ForegroundRequest if state.is_restoring() => {
                    let _ = browser.clear_foreground_request();
                }
                ChangeKind::ForegroundRequest => state.bring_forward(browser),
                // A placeholder goes, or stays, as the tabs change, and the
                // pins' links follow them; undocked DevTools shows its
                // active tab. A tab left for another has its picture taken,
                // and one whose page changes has it go stale.
                ChangeKind::Tabs | ChangeKind::Tab | ChangeKind::Split => {
                    tabs::closes::settle(&state.analytics);
                    tabs::roles::forget_closed();
                    items::carry::forget_gone();
                    placeholder::settle(browser);
                    tabs::previews::follow_active(browser);
                    if let Some(tab) = change.tab
                        && change
                            .tab_fields
                            .intersects(TabFields::URL | TabFields::LOADING)
                    {
                        tabs::previews::page_changed(tab);
                    }
                    if pins::settle(state, browser, change)
                        && let Some(window) = state.windows.of(browser)
                    {
                        ipc::send_tabs(&window, browser);
                    }
                    if let Some(window) = state.devtools.borrow().get(browser) {
                        window.show_active_tab();
                    }
                }
                _ => {}
            }
        }
        for window in self.state.windows.all() {
            if changes::apply(&window, changes) {
                state.update_title(&window);
            }
        }
        // A dialog opened or closed, or another Browser came in front, as
        // a switch makes one active and another not.
        if changes
            .iter()
            .any(|change| matches!(change.kind, ChangeKind::ModalDialog | ChangeKind::Active))
        {
            state.update_front_menu(mt);
        }
    }

    // The window is the one of the Browser in the key window, or the key
    // window, or else the one the user was in last. A popup's has commands
    // of its own (`popup_command`).
    fn menu_command(&self, mt: MainThread, id: &str, browser: Option<Browser>) {
        let windows = &self.state.windows;
        // Needs no window; the menu follows the change.
        if id == menus::TOGGLE_QUIT_WARNING {
            if let Err(error) = mt.set_quit_warning(!mt.quit_warning().on) {
                eprintln!("Wren could not change Warn Before Quitting: {error:?}");
            }
            return;
        }
        // macOS asks the user; the change that follows checks the item.
        if id == menus::SET_DEFAULT_BROWSER {
            return mt.set_as_default_browser(|_| {});
        }
        if id == menus::RESET_ONBOARDING {
            return self.state.reset_onboarding(mt);
        }
        // Onboarding's menu has nothing else of the app's but its page's
        // DevTools and Reload UI.
        if let Some(onboarding) = self.state.onboarding() {
            if id == menus::TOGGLE_UI_DEVTOOLS {
                State::toggle_ui_devtools(&onboarding);
            } else if id == menus::RELOAD_UI {
                State::reload_ui(&onboarding);
            }
            return;
        }
        // The window the user browses in answers, with its update card or a
        // toast: a popup's has neither.
        if id == menus::CHECK_FOR_UPDATES {
            if let Some(front) = windows.front() {
                front.page.bring_forward();
                self.state.updates.check(&self.state, front.id);
            }
            return;
        }
        // In the window links open in, whatever window is key, a popup's too.
        if id == menus::IMPORT {
            return self.state.show_page(mt, &pages::MIGRATE);
        }
        // A window of the system's or a plain one, such as the About
        // panel, closes as it would in any app.
        if (id == menus::CLOSE_TAB || id == menus::CLOSE_WINDOW)
            && close_other_key_window(windows.all().iter().map(|window| &window.page))
        {
            return;
        }
        let key = browser
            .and_then(|browser| windows.of(&browser))
            .or_else(|| windows.in_use());
        // The page of the key window, a popup's too.
        if id == menus::TOGGLE_UI_DEVTOOLS || id == menus::RELOAD_UI {
            if let Some(window) = key.or_else(|| windows.front()) {
                if id == menus::RELOAD_UI {
                    State::reload_ui(&window.page);
                } else {
                    State::toggle_ui_devtools(&window.page);
                }
            }
            return;
        }
        // Every window's, a popup's in front too.
        if id == menus::TOGGLE_ADDRESS_BAR {
            let _ = ipc::toggle_address_bar(&self.state);
            return;
        }
        if let Some(popup) = key.as_ref().filter(|window| window.is_popup()) {
            return self.popup_command(mt, id, popup);
        }
        let window = key.or_else(|| windows.front());
        // From the window in front, if one is.
        if id == menus::NEW_WINDOW {
            return self.state.new_window(mt, window.as_deref());
        }
        if id == menus::NEW_INCOGNITO_WINDOW {
            return self.state.new_incognito_window(mt, window.as_deref());
        }
        let Some(window) = window else {
            return;
        };
        // The page switches, so the sidebar slides as a press makes it. The
        // items are greyed out while a window on a profile is in front.
        if let Some(space) = id.strip_prefix(menus::SPACE).and_then(|id| id.parse().ok()) {
            return ipc::send_choose_space(&window, space);
        }
        if id == menus::CLOSE_WINDOW {
            return self.state.close_window(mt, window.id);
        }
        if id == menus::TOGGLE_SIDEBAR {
            return ipc::send_toggle_sidebar(&window);
        }
        if id == menus::SHOW_DOWNLOADS {
            return ipc::send_reveal(&window, None);
        }
        if id == menus::SHOW_SETTINGS {
            return ipc::send_show_settings(&window);
        }
        if id == menus::NEW_TAB {
            return ipc::send_show_omnibox(&window, OmniboxTarget::NewTab, true);
        }
        if id == menus::OPEN_LOCATION {
            return ipc::send_show_omnibox(&window, OmniboxTarget::Current, true);
        }
        if id == menus::CLOSE_TAB {
            return self.state.close_tab(mt, &window);
        }
        if let Some(number) = id
            .strip_prefix(menus::FAVORITE)
            .and_then(|n| n.parse::<usize>().ok())
        {
            return pins::open_favorite(&self.state, mt, &window, number.saturating_sub(1));
        }
        let Some(browser) = window.browser() else {
            return;
        };
        let _ = match id {
            menus::COPY_URL => tabs::copy_url(&browser),
            menus::DUPLICATE_TAB => browser.active_tab().map_or(Ok(()), tabs::duplicate),
            menus::MOVE_TAB_UP | menus::MOVE_TAB_DOWN => match browser.active_tab() {
                Some(tab) => tabs::move_by(
                    mt,
                    &browser,
                    tab,
                    if id == menus::MOVE_TAB_UP { -1 } else { 1 },
                ),
                None => Ok(()),
            },
            _ => Ok(()),
        };
    }

    // Toasts and the find bar are the page's: the toast at the window's top
    // right, Chromium's and the app's own alike, and the bar at the active
    // tab's. The page hears of one once Chromium's call is over, when the
    // request is open. A page's request for permissions is the page's too,
    // a prompt off its page info button (ipc/permission.rs), and the
    // download bubble is its shelf or Library (ipc/downloads.rs). The rest
    // of Chromium's popovers are its own still.
    // The zoom is a toast of the app's instead ("110%"), one for each change,
    // through the Browser's toast queue as the rest; Chromium's bubble
    // does not show.
    fn popover(&self, mt: MainThread, request: &PopoverRequest) -> PopoverAnswer {
        if request.kind == PopoverKind::Zoom {
            let browser = request.browser.clone();
            mt.later(move |_| {
                if let Ok(zoom) = browser.zoom_state() {
                    let _ = ipc::show_toast(&browser, OwnToast::Zoom(zoom.percent));
                }
            });
            return PopoverAnswer::None;
        }
        if request.kind == PopoverKind::Downloads {
            return ipc::show_downloads_bubble(&self.state, mt, request);
        }
        if request.kind == PopoverKind::Permission {
            return ipc::show_permission_prompt(&self.state, mt, request);
        }
        if !matches!(request.kind, PopoverKind::Toast | PopoverKind::Find) {
            return PopoverAnswer::Chromium;
        }
        let state = Rc::downgrade(&self.state);
        let browser = request.browser.clone();
        let kind = request.kind;
        let tab = request.tab;
        // A find the user opened takes the keyboard; one that comes back
        // with its tab does not.
        let focus = request.trigger != PopoverTrigger::Automatic;
        if kind == PopoverKind::Find && focus {
            self.state.analytics.record(Event::FindOpened);
        }
        mt.later(move |_| {
            let Some(state) = state.upgrade() else { return };
            if let Some(window) = state.windows.of(&browser)
                && window.is_front(&browser)
            {
                match kind {
                    PopoverKind::Find => ipc::send_show_find(&window, &browser, tab, focus),
                    _ => ipc::send_toast(&window, &browser),
                }
            }
        });
        PopoverAnswer::App
    }

    // Chromium wants the address field, as a New Tab page given the
    // keyboard does: the omnibox opens for it, as ⌘L opens it. Not for the
    // placeholder, which the page does not show, nor over the omnibox for a
    // new tab, nor in a popup's window, whose omnibox opens only when the
    // user asks for it.
    fn focus_location_bar(&self, _: MainThread, browser: Browser) {
        let Some(window) = self
            .state
            .windows
            .of(&browser)
            .filter(|window| window.is_front(&browser) && !window.is_popup())
        else {
            return;
        };
        if window.active_tab().is_none() || window.has_new_tab_omnibox() {
            return;
        }
        ipc::send_show_omnibox(&window, OmniboxTarget::Current, false);
    }

    // A page wants the whole window, or is done with it. The window goes full
    // screen for it once Chromium's call is over, and Chromium hears when it
    // has (BrowserWindow::full_screen_finished). A page in the background, or
    // one leaving full screen the user chose, has its way at once.
    fn fullscreen(&self, mt: MainThread, browser: Browser, fullscreen: bool) -> bool {
        let Some(window) = self
            .state
            .windows
            .of(&browser)
            .filter(|window| window.is_front(&browser))
        else {
            return false;
        };
        if !window.wants_full_screen_for_page(fullscreen) {
            return false;
        }
        let state = Rc::downgrade(&self.state);
        let id = window.id;
        mt.later(move |_| {
            let Some(state) = state.upgrade() else { return };
            if let Some(window) = state.windows.get(id) {
                window.page.set_full_screen(fullscreen);
            }
        });
        true
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
        let sender = LinkSender {
            app_id: "com.hnc.Discord".into(),
            app_name: "Discord".into(),
        };
        self.state.open_urls(mt, urls, Some(sender));
    }

    // Chromium closes a Browser whose last tab closes. Its window stays, with
    // the space empty, unless the user is closing the window: that goes with
    // its last Browser, and the app with the last window where it quits so.
    // A window on a profile stays too: at quit, each Browser closes before
    // the app hears of the quit, and the window must be kept. One whose
    // profile was deleted goes with it (`State::leave_gone_profiles`). A
    // popup's window goes with its Browser, always.
    fn browser_closed(&self, mt: MainThread, browser: Browser) {
        tabs::roles::forget_closed();
        items::carry::forget_gone();
        tabs::closes::forget_gone();
        tabs::previews::forget(&browser);
        let devtools = self.state.devtools.borrow_mut().remove(&browser);
        if devtools.is_some() {
            return;
        }
        let Some(window) = self.state.windows.of(&browser) else {
            return;
        };
        let place = window.remove(&browser);
        if window.is_popup() {
            self.state.link_popup_closed(&window);
            ipc::quit_window_closing(&self.state, window.id);
            ipc::forget_move_question(window.id);
            self.state.windows.remove(window.id);
            return;
        }
        if window.is_closing() {
            if !window.has_browsers() {
                self.state.windows.remove(window.id);
                if QUITS_WITH_LAST_WINDOW && self.state.windows.len() == 0 {
                    mt.quit();
                }
            }
            return;
        }
        if place.is_some() && place == window.place() {
            ipc::send_no_browser(&window);
            self.state.update_title(&window);
        } else if let Some(place) = place {
            ipc::send_no_tabs_for(&window, &place);
        }
    }
}

// A tab's page that has just crashed.
fn record_tab_crash(state: &State, change: &Change) {
    if change.kind != ChangeKind::Tab || !change.tab_fields.contains(TabFields::CRASHED) {
        return;
    }
    let crash = change
        .tab
        .and_then(|tab| tab.state().ok())
        .map(|tab| tab.crash);
    if let Some(reason) = crash.and_then(analytics::Crash::of) {
        state.analytics.record(Event::TabCrashed { reason });
    }
}
