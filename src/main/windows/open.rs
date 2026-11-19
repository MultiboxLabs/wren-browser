// Opening windows: one on a place, with no Browser yet, as the app starts,
// as the user asks for one, or for a Browser that has none. Where each
// Browser goes, and getting it into its window, is browsers.rs's.

use std::cell::Cell;
use std::rc::Rc;

use wren::{MainThread, RequestedBounds};

use super::mini_wren::MINI_WREN_MIN_SIZE;
use super::session::unkept_window_key;
use crate::analytics::Event;
use crate::app::State;
use crate::ipc::{self, WindowRef};
use crate::menus;
use crate::pages::UI;
use crate::perf::PageCounts;
use crate::platform::{PageWindow, WindowKind, WindowSize};
use crate::spaces;
use crate::windows::{self, BrowserWindow, MiniWren, Place, WindowId};

/// A browser window's size when nothing gives it one.
const WINDOW_SIZE: (f64, f64) = (1280.0, 800.0);

/// A browser window's minimum: the docked sidebar at its widest
/// (`SIDEBAR_WIDTH` in the renderer) leaves a page as wide as a phone's.
const WINDOW_MIN_SIZE: (f64, f64) = (800.0, 500.0);

/// Opens a window on `place`, with no Browser yet; with no place, the
/// window waits for its first Browser to give it one (`place_opened`).
/// It is kept in the database while it is open (session.rs), unless it
/// is off the record.
pub fn open(state: &Rc<State>, mt: MainThread, place: Option<Place>) -> Option<WindowId> {
    let key = match place.as_ref().is_some_and(Place::is_off_the_record) {
        true => unkept_window_key(),
        false => windows::new_key(state),
    };
    open_keyed(state, mt, key, place, None)
}

/// Opens window `key` on `place`, as `open` does: at `frame` if
/// it has one, else below and right of the window in use, so a new one
/// does not hide it.
pub(super) fn open_keyed(
    state: &Rc<State>,
    mt: MainThread,
    key: String,
    place: Option<Place>,
    frame: Option<RequestedBounds>,
) -> Option<WindowId> {
    let front = state.windows.front();
    let window = open_page_window(state, mt, key, place, frame.is_some(), None)?;
    match (frame, front) {
        (Some(frame), _) => window.page.restore_frame(frame),
        (None, Some(front)) => window.page.cascade_from(&front.page),
        (None, None) => {}
    }
    Some(window.id)
}

/// Analytics hears of it if the UI's page in `page` crashes.
pub(crate) fn count_crashes(state: &Rc<State>, page: &PageWindow) {
    let weak = Rc::downgrade(state);
    page.watch_crash(move || {
        if let Some(state) = weak.upgrade() {
            state.analytics.record(Event::PageCrashed);
        }
    });
}

/// Opens a browser window, `key` on `place`, where AppKit puts it: a
/// Mini Wren (mini_wren/), a panel that never brings the app forward,
/// or else one the user browses in. Its page is the UI's, in a Profile
/// of its own. `framed`: the caller places the window, and its first
/// Browser's frame does not move it (`BrowserWindow::add`).
pub(super) fn open_page_window(
    state: &Rc<State>,
    mt: MainThread,
    key: String,
    place: Option<Place>,
    framed: bool,
    mini_wren: Option<MiniWren>,
) -> Option<Rc<BrowserWindow>> {
    let profile = state.ui_profile.borrow().clone()?;
    let id = state.windows.next_id();
    let (min_size, kind) = match mini_wren {
        Some(_) => (MINI_WREN_MIN_SIZE, WindowKind::Panel),
        None => (WINDOW_MIN_SIZE, WindowKind::Window),
    };
    let weak = Rc::downgrade(state);
    let should_close = move || {
        if let Some(state) = weak.upgrade() {
            windows::close(&state, mt, id);
        }
        // The window goes as its Browsers close (`browser_closed`).
        false
    };
    let page = PageWindow::open(
        UI.web_view(&profile)?,
        "Wren",
        WindowSize::Resizable {
            size: WINDOW_SIZE,
            min: min_size,
        },
        kind,
        should_close,
    );
    ipc::handle_ui(&page.web_view, &WindowRef::new(state, id), mt);
    // The page and the backdrop are drawn as in use while the window is.
    // A Mini Wren is never the window the user browses in. Going out of
    // use counts once the window has been in use: as it first shows, the
    // app may not have come forward yet.
    let weak = Rc::downgrade(state);
    let in_use = Cell::new(false);
    page.watch_active(mt, move |active| {
        let Some(state) = weak.upgrade() else { return };
        let Some(window) = state.windows.get(id) else {
            return;
        };
        if !active {
            // Where it is now, should the app not quit as it should.
            windows::save_frame(&state, &window);
            if in_use.replace(false) {
                windows::mini_wren::window_left(&state, mt, &window);
            }
        } else {
            in_use.set(true);
            windows::mini_wren::window_used(&state, id);
            if window.is_mini_wren() {
                // A Mini Wren in use allows Open as Tab.
                menus::update_front_menu(&state, mt);
            } else {
                state.windows.set_active(id);
                menus::update_front_menu(&state, mt);
                // The space the user is in is the one used last.
                if let Some(space) = window.space() {
                    spaces::touch(&state, space);
                }
            }
        }
        ipc::show_active(&window.page, active);
    });
    // Whether the pointer is over the sidebar, as it moves, and as the
    // window comes into use or goes out of it.
    let weak = Rc::downgrade(state);
    page.watch_pointer(mt, move || {
        let Some(state) = weak.upgrade() else { return };
        if let Some(window) = state.windows.get(id) {
            ipc::check_sidebar_hover(&window);
        }
    });
    count_crashes(state, &page);
    let weak = Rc::downgrade(state);
    page.watch_full_screen(move |full_screen| {
        let Some(state) = weak.upgrade() else { return };
        if let Some(window) = state.windows.get(id) {
            ipc::send_full_screen(&window.page, full_screen);
        }
    });
    let weak = Rc::downgrade(state);
    page.watch_full_screen_finished(move |full_screen| {
        let Some(state) = weak.upgrade() else { return };
        if let Some(window) = state.windows.get(id) {
            window.full_screen_finished(full_screen);
        }
    });
    let perf_counts = state.perf.as_ref().map(|_| PageCounts::default());
    state.windows.add(BrowserWindow::new(
        id,
        key,
        page,
        place,
        framed,
        mini_wren,
        perf_counts,
    ));
    let window = state.windows.get(id)?;
    // Named for its place until a tab is in front, or should none come.
    windows::update_title(state, &window);
    Some(window)
}

/// Opens a window on `place`, with a Browser that has no tab yet.
fn open_on(state: &Rc<State>, mt: MainThread, place: Place) {
    let Some(id) = open(state, mt, Some(place.clone())) else {
        return eprintln!("Wren opened no window.");
    };
    if let Some(space) = place.space() {
        spaces::touch(state, space);
    }
    windows::open_browser(state, mt, id, place, || {});
}

/// New Window: a window of spaces, on the space of `window` if one is
/// in front and shows spaces, else on the space used last. A window on
/// a profile, or its off-the-record side, is opened otherwise (the
/// Library, New Incognito Window).
pub fn new_window(state: &Rc<State>, mt: MainThread, window: Option<&BrowserWindow>) {
    match window.and_then(BrowserWindow::space) {
        Some(space) => open_on(state, mt, Place::Space(space)),
        None => open_recent(state, mt),
    }
}

/// Opens a window for profile `id`, as the user asks: on its most
/// recent space, or with none, on the profile. Fails if the profile is
/// gone.
pub fn open_for_profile(state: &Rc<State>, mt: MainThread, id: String) -> Result<(), String> {
    if !mt.profile_list().iter().any(|profile| profile.id == id) {
        return Err("That profile is gone.".to_owned());
    }
    match state.db.recent_space(&id) {
        Ok(Some(space)) => open_on(state, mt, Place::Space(space.id)),
        Ok(None) => open_on(
            state,
            mt,
            Place::Profile {
                id,
                off_the_record: false,
            },
        ),
        Err(error) => eprintln!("Wren could not read the spaces: {error}"),
    }
    state.analytics.record(Event::ProfileWindowOpened);
    Ok(())
}

/// New Incognito Window: on the off-the-record side of `window`'s
/// profile, or with none in front, of the startup profile's.
pub fn new_incognito_window(state: &Rc<State>, mt: MainThread, window: Option<&BrowserWindow>) {
    let place = |id| Place::Profile {
        id,
        off_the_record: true,
    };
    let profile = match window.and_then(BrowserWindow::place) {
        Some(Place::Space(space)) => match state.db.space(space) {
            Ok(row) => row.map(|row| row.profile),
            Err(error) => return eprintln!("Wren could not read the spaces: {error}"),
        },
        Some(place) => place.profile().map(str::to_owned),
        None => None,
    };
    if let Some(id) = profile {
        return open_on(state, mt, place(id));
    }
    let state = state.clone();
    mt.open_profile(None, move |result| match result {
        Ok(profile) => open_on(&state, mt, place(profile.id())),
        Err(error) => eprintln!("Wren opened no Profile: {error:?}"),
    });
}

/// Opens a window on the space used last, of any profile: the Dock icon,
/// or New Window, with no window open.
pub fn open_recent(state: &Rc<State>, mt: MainThread) {
    match state.db.most_recent_space() {
        Ok(Some(space)) => open_on(state, mt, Place::Space(space.id)),
        Ok(None) => eprintln!("Wren found no space to open."),
        Err(error) => eprintln!("Wren could not read the spaces: {error}"),
    }
}
