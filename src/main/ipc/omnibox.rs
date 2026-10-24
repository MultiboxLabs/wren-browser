// The omnibox: Chromium's suggestions for what is typed in the page's field,
// and opening one as Chrome does, so history and search engines learn from
// it. The page draws the field and the list (pages/ui/omnibox.tsx); the main
// menu asks it to open (`send_show_omnibox`).

use serde::{Deserialize, Serialize};
use wren::{
    Browser, LocationText, MainThread, OmniboxFlags, OmniboxResult, OpenDisposition,
    SuggestionKind, SuggestionText, WebView,
};

use super::{WindowRef, failed, give_back_keyboard, with_browser, with_window};
use crate::pages::icons;
use crate::tabs;
use crate::window::BrowserWindow;

/// What the page asks suggestions for.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Query {
    text: String,
    /// The caret, in UTF-16 units.
    cursor: usize,
    /// The search engine keyword the field is in, if it is in one.
    keyword: Option<String>,
    /// Do not complete inline: the user deleted or pasted.
    no_inline: bool,
    /// The field has just opened, not been edited.
    on_focus: bool,
}

/// A suggestion the page chose, in the set it was read from.
#[derive(Deserialize)]
struct Chosen {
    /// `Suggestions::result`.
    result: String,
    index: usize,
}

impl Chosen {
    fn result(&self) -> Result<OmniboxResult, String> {
        self.result
            .parse()
            .map_err(|_| "There is no such set of suggestions.".into())
    }
}

/// A suggestion to open, and how.
#[derive(Deserialize)]
struct Open {
    #[serde(flatten)]
    chosen: Chosen,
    disposition: Disposition,
}

/// How a suggestion opens: in the active tab, in a new one at the top of
/// the sidebar's list (shown, or behind the active one), or by switching to the tab that has its page.
#[derive(Deserialize)]
#[serde(rename_all = "kebab-case")]
enum Disposition {
    Current,
    NewTab,
    BackgroundTab,
    NewWindow,
    Switch,
}

/// An address to open, which no suggestion of Chromium's names: a bang's.
#[derive(Deserialize)]
struct Navigate {
    url: String,
    disposition: BangDisposition,
}

/// How a bang opens: in the active tab, or in a new one (shown, or behind
/// the active one).
#[derive(Deserialize)]
#[serde(rename_all = "kebab-case")]
enum BangDisposition {
    Current,
    NewTab,
    BackgroundTab,
}

/// What the omnibox is for: a new tab, as the New Tab command opens it, or
/// the active tab's address, as Open Location does.
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum OmniboxTarget {
    NewTab,
    Current,
}

/// Chromium's suggestions for the text the page last asked about.
#[derive(Serialize)]
pub struct Suggestions {
    /// The set they are, as text: a u64, which a JS number cannot hold.
    result: String,
    suggestions: Vec<Suggestion>,
}

/// A suggestion as the page draws it, its text as Chromium's list has it.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Suggestion {
    kind: &'static str,
    /// Return opens it; its inline completion follows the caret.
    is_default: bool,
    /// `omnibox.delete` removes it.
    deletable: bool,
    /// Its page is open in a tab, which it can switch to.
    has_tab: bool,
    /// The description goes first: an answer to a search.
    swap: bool,
    /// The main line: "youtube.com", "weather paris".
    contents: String,
    /// The second part: the page's title, "Google Search".
    description: String,
    /// What the field shows while it is selected.
    fill: String,
    /// For the default: the text to add after the caret, selected.
    inline: String,
    /// The keyword Tab enters keyword mode with, and its chip's name.
    keyword: String,
    keyword_name: String,
    /// Its page's favicon's icon ID, if it has one yet.
    icon: Option<String>,
}

pub fn handle(web_view: &WebView, window: &WindowRef, mt: MainThread) {
    // Makes sure the window's place has a Browser for the omnibox to ask,
    // as one it has opened no tab in has none: one with no tab yet but its
    // placeholder. Answers once it is there. Any Browser will do, so this
    // asks for one, not whether the place is empty (`browser_with_tabs`).
    let weak = window.clone();
    let _ = web_view.handle_call("omnibox.prepare", move |call| {
        // The window's place, if it has no Browser.
        let without = with_window(&weak, |window| match (window.browser(), window.place()) {
            (Some(_), _) => Ok(None),
            (None, Some(place)) => Ok(Some(place)),
            (None, None) => Err("The window is on no space.".to_owned()),
        });
        match (without, weak.state()) {
            (Ok(None), _) => {
                let _ = call.answer(&());
            }
            // A Browser that is not made drops the call, which fails it.
            (Ok(Some(place)), Ok(state)) => {
                state.open_browser(mt, weak.id, place, move || {
                    let _ = call.answer(&());
                });
            }
            (Err(error), _) => {
                let _ = call.fail(&error);
            }
            (_, Err(error)) => {
                let _ = call.fail(error);
            }
        }
    });

    // Which omnibox the page shows, if one: ⌘W closes the one for a new tab
    // rather than a tab.
    let weak = window.clone();
    let _ = web_view.handle("omnibox.shown", move |shown: Option<OmniboxTarget>| {
        with_window(&weak, |window| {
            window.set_new_tab_omnibox(matches!(shown, Some(OmniboxTarget::NewTab)));
            Ok(())
        })
    });

    // The active tab's address as the field shows it to be edited, or ""
    // on a page with none to show (the New Tab page).
    let weak = window.clone();
    let _ = web_view.handle("omnibox.location", move |()| {
        with_browser(&weak, |_, browser| {
            let shown = browser.location_state().is_ok_and(|state| state.show_url);
            Ok(if shown {
                browser.location_text(LocationText::Edit)
            } else {
                String::new()
            })
        })
    });

    // Asks for suggestions, and answers with those Chromium has at once;
    // "omnibox.suggestions" brings the rest as they arrive.
    let weak = window.clone();
    let _ = web_view.handle("omnibox.query", move |query: Query| {
        with_browser(&weak, |window, browser| {
            let mut flags = OmniboxFlags::empty();
            if query.no_inline {
                flags |= OmniboxFlags::NO_INLINE;
            }
            if query.on_focus {
                flags |= OmniboxFlags::ON_FOCUS;
            }
            browser
                .omnibox_query(&query.text, query.cursor, query.keyword.as_deref(), flags)
                .map_err(failed)?;
            window.set_omnibox_query(browser.clone());
            Ok(suggestions(browser))
        })
    });

    // Opens a suggestion, then stops the query, as Chrome reverts its field.
    // One opened in the background leaves the omnibox as it is.
    let weak = window.clone();
    let _ = web_view.handle("omnibox.open", move |open: Open| {
        with_browser(&weak, |window, browser| {
            let (result, index) = (open.chosen.result()?, open.chosen.index);
            let opened = match open.disposition {
                Disposition::Current => {
                    browser.open_suggestion(result, index, OpenDisposition::CurrentTab)
                }
                Disposition::NewTab => {
                    open_in_new_tab(browser, result, index, OpenDisposition::NewTab)
                }
                Disposition::BackgroundTab => {
                    open_in_new_tab(browser, result, index, OpenDisposition::BackgroundTab)
                }
                Disposition::NewWindow => {
                    browser.open_suggestion(result, index, OpenDisposition::NewWindow)
                }
                Disposition::Switch => {
                    browser.open_suggestion(result, index, OpenDisposition::SwitchToTab)
                }
            };
            if matches!(open.disposition, Disposition::BackgroundTab) {
                return opened.map_err(failed);
            }
            let _ = stop(window, browser);
            opened.map_err(failed)?;
            // A new tab gets it as it arrives in its element (App::changed),
            // and a new window as it is shown.
            if !matches!(open.disposition, Disposition::NewWindow) {
                give_back_keyboard(browser);
            }
            Ok(())
        })
    });

    // Opens a bang's address, as `omnibox.open` opens a suggestion. Only a web
    // address: the page takes it from a list it loaded.
    let weak = window.clone();
    let _ = web_view.handle("omnibox.navigate", move |navigate: Navigate| {
        with_browser(&weak, |window, browser| {
            let Navigate { url, disposition } = navigate;
            if !(url.starts_with("https://") || url.starts_with("http://")) {
                return Err("Only a web address opens.".into());
            }
            if matches!(disposition, BangDisposition::BackgroundTab) {
                return browser
                    .add_tab(&url, Some(0), false)
                    .map(drop)
                    .map_err(failed);
            }
            let _ = stop(window, browser);
            match disposition {
                BangDisposition::Current => {
                    let tab = browser
                        .active_tab()
                        .ok_or("There is no tab to open it in.")?;
                    tab.navigate(&url).map_err(failed)?;
                }
                _ => tabs::open(browser, &url).map_err(failed)?,
            }
            give_back_keyboard(browser);
            Ok(())
        })
    });

    // Removes a suggestion from history or a search engine's record, as
    // Chrome's X does; "omnibox.suggestions" brings the list without it.
    let weak = window.clone();
    let _ = web_view.handle("omnibox.delete", move |chosen: Chosen| {
        with_browser(&weak, |_, browser| {
            browser
                .delete_suggestion(chosen.result()?, chosen.index)
                .map_err(failed)
        })
    });

    // Stops the query, and gives the active tab's page the keyboard back.
    let weak = window.clone();
    let _ = web_view.handle("omnibox.close", move |()| {
        with_browser(&weak, |window, browser| {
            stop(window, browser).map_err(failed)?;
            give_back_keyboard(browser);
            Ok(())
        })
    });
}

/// Tells the page Chromium's suggestions changed: more arrived, or an icon.
/// Only for the omnibox's query: once it stops, Chromium's list is cleared,
/// which is no news of the list the page shows as it closes.
pub fn send_omnibox(window: &BrowserWindow, browser: &Browser) {
    if !window.asks_omnibox(browser) {
        return;
    }
    if let Some(suggestions) = suggestions(browser) {
        let _ = window
            .page
            .web_view
            .send("omnibox.suggestions", &suggestions);
    }
}

/// Tells the page to open the omnibox for `target`; and, if `toggles`, to
/// close it instead if that one is open, as the main menu's shortcuts do.
/// The page takes the keyboard from the tab for it.
pub fn send_show_omnibox(window: &BrowserWindow, target: OmniboxTarget, toggles: bool) {
    #[derive(Serialize)]
    struct Show {
        target: OmniboxTarget,
        toggles: bool,
    }
    let _ = window.page.web_view.focus();
    let _ = window
        .page
        .web_view
        .send("omnibox.show", &Show { target, toggles });
}

/// Tells the page to close the omnibox, as a press outside it does.
pub fn send_close_omnibox(window: &BrowserWindow) {
    let _ = window.page.web_view.send("omnibox.hide", &());
}

/// Stops the query of the Browser the page's omnibox asks, if it asks one:
/// the window is leaving that Browser for another space's, and the page
/// closes its omnibox as it does.
pub fn stop_omnibox(window: &BrowserWindow) {
    if let Some(browser) = window.take_omnibox_query() {
        let _ = browser.omnibox_stop();
    }
}

// Stops the omnibox's query, which clears Chromium's suggestions; the page
// hears nothing of it.
fn stop(window: &BrowserWindow, browser: &Browser) -> Result<(), wren::Error> {
    window.take_omnibox_query();
    browser.omnibox_stop()
}

// A new tab goes at the top of the sidebar's list, where Chromium's would
// not: it is the one opening the suggestion added.
fn open_in_new_tab(
    browser: &Browser,
    result: OmniboxResult,
    index: usize,
    disposition: OpenDisposition,
) -> Result<(), wren::Error> {
    let before = browser.tabs();
    browser.open_suggestion(result, index, disposition)?;
    match browser.tabs().into_iter().find(|tab| !before.contains(tab)) {
        Some(tab) => tab.move_to(0),
        None => Ok(()),
    }
}

fn suggestions(browser: &Browser) -> Option<Suggestions> {
    let state = browser.omnibox_state().ok()?;
    let suggestions = (0..state.suggestion_count)
        .filter_map(|index| {
            let suggestion = browser.suggestion(index).ok()?;
            let text = |text| browser.suggestion_text(index, text);
            Some(Suggestion {
                kind: kind(suggestion.kind),
                is_default: suggestion.is_default,
                deletable: suggestion.deletable,
                has_tab: suggestion.has_tab,
                swap: suggestion.swap_contents_and_description,
                contents: text(SuggestionText::Contents),
                description: text(SuggestionText::Description),
                fill: text(SuggestionText::Fill),
                inline: text(SuggestionText::Inline),
                keyword: text(SuggestionText::Keyword),
                keyword_name: text(SuggestionText::KeywordName),
                icon: browser.suggestion_icon_png(index).map(icons::id),
            })
        })
        .collect();
    Some(Suggestions {
        result: state.result.to_string(),
        suggestions,
    })
}

fn kind(kind: SuggestionKind) -> &'static str {
    match kind {
        SuggestionKind::Search => "search",
        SuggestionKind::SearchHistory => "search-history",
        SuggestionKind::Url => "url",
        SuggestionKind::History => "history",
        SuggestionKind::Bookmark => "bookmark",
        SuggestionKind::OpenTab => "open-tab",
        SuggestionKind::Calculator => "calculator",
        SuggestionKind::Clipboard => "clipboard",
        SuggestionKind::Other => "other",
    }
}
