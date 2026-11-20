// The main menu's commands. Each finds the window it is for, and hands it to
// the part that does it. Toggle UI DevTools and Reload UI are Wren Runtime's
// calls on a window's page, and no part's.

use std::rc::Rc;

use wren::{Browser, MainThread};

use super::State;
use crate::ipc::{self, OmniboxTarget};
use crate::menus;
use crate::onboarding;
use crate::pages;
use crate::pins;
use crate::platform::{PageWindow, close_other_key_window};
use crate::settings;
use crate::tabs;
use crate::windows;

// The window is the one of the Browser in the key window, or the key
// window, or else the one the user was in last. A Mini Wren has
// commands of its own (windows/mini_wren/commands.rs).
pub(super) fn menu_command(state: &Rc<State>, mt: MainThread, id: &str, browser: Option<Browser>) {
    let windows = &state.windows;
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
        return onboarding::reset(state, mt);
    }
    // Onboarding's menu has nothing else of the app's but its page's
    // DevTools and Reload UI.
    if let Some(onboarding) = onboarding::window(state) {
        if id == menus::TOGGLE_UI_DEVTOOLS {
            toggle_ui_devtools(&onboarding);
        } else if id == menus::RELOAD_UI {
            reload_ui(&onboarding);
        }
        return;
    }
    // The window the user browses in answers, with its update card or a
    // toast: a Mini Wren has neither.
    if id == menus::CHECK_FOR_UPDATES {
        if let Some(front) = windows.front() {
            front.page.bring_forward();
            state.updates.check(state, front.id);
        }
        return;
    }
    // In the window the user browses in, whatever window is key, a
    // Mini Wren too (windows/show_page.rs).
    if id == menus::IMPORT {
        return windows::show_page(state, mt, &pages::MIGRATE);
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
    // The page of the key window, a Mini Wren's too.
    if id == menus::TOGGLE_UI_DEVTOOLS || id == menus::RELOAD_UI {
        if let Some(window) = key.or_else(|| windows.front()) {
            if id == menus::RELOAD_UI {
                reload_ui(&window.page);
            } else {
                toggle_ui_devtools(&window.page);
            }
        }
        return;
    }
    // Every window's, a Mini Wren in front too.
    if id == menus::TOGGLE_ADDRESS_BAR {
        let _ = settings::toggle_address_bar(state);
        return;
    }
    if let Some(window) = key.as_ref().filter(|window| window.is_mini_wren()) {
        return windows::mini_wren::command(state, mt, id, window);
    }
    let window = key.or_else(|| windows.front());
    // From the window in front, if one is.
    if id == menus::NEW_WINDOW {
        return windows::new_window(state, mt, window.as_deref());
    }
    if id == menus::NEW_INCOGNITO_WINDOW {
        return windows::new_incognito_window(state, mt, window.as_deref());
    }
    if id == menus::NEW_MINI_WREN {
        return windows::mini_wren::open_empty(state, mt);
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
        return windows::close(state, mt, window.id);
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
        return windows::close_tab(state, mt, &window);
    }
    if let Some(number) = id
        .strip_prefix(menus::FAVORITE)
        .and_then(|n| n.parse::<usize>().ok())
    {
        return pins::open_favorite(state, mt, &window, number.saturating_sub(1));
    }
    let Some(browser) = window.browser() else {
        return;
    };
    if id == menus::MOVE_TAB_UP || id == menus::MOVE_TAB_DOWN {
        let by = if id == menus::MOVE_TAB_UP { -1 } else { 1 };
        if let (Some(tab), Some(place)) = (browser.active_tab(), window.place_of(&browser)) {
            let _ = tabs::move_by(state, mt, &place, &browser, tab, by);
        }
        return;
    }
    let _ = match id {
        menus::COPY_URL => tabs::copy_url(&browser),
        menus::DUPLICATE_TAB => browser.active_tab().map_or(Ok(()), tabs::duplicate),
        _ => Ok(()),
    };
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
