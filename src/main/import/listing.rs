// What the pages that bring things over list before a run (ipc/migrate.rs):
// where the page is, the browsers installed with their profiles, and what
// each profile has. wren://migrate and onboarding ask alike. Another
// browser's files are read on a thread, and the answer comes back on the
// main thread.

use std::any::Any;
use std::cell::{Cell, RefCell};
use std::collections::HashMap;

use serde::Serialize;
use wren::{MainThread, Profile, ProfileListEntry};

use super::{Landing, ReadError, SourceProfile, SpaceCount, Survey};
use crate::pages::icons;

/// A profile of the user's in Wren.
#[derive(Serialize)]
pub struct WrenProfile {
    id: String,
    name: String,
}

impl From<&ProfileListEntry> for WrenProfile {
    fn from(entry: &ProfileListEntry) -> WrenProfile {
        WrenProfile {
            id: entry.id.clone(),
            name: entry.name.clone(),
        }
    }
}

/// Where the page is: whether its tab is incognito, the profile its tab is
/// in (an incognito tab's original), and every profile there is, which the
/// user's other profiles may land in.
#[derive(Serialize)]
pub struct Context {
    incognito: bool,
    profile: Option<WrenProfile>,
    profiles: Vec<WrenProfile>,
}

/// The size a source's icon is drawn at, in points: the largest a page
/// shows it, wren://migrate's sky, its body 84 in the margin around it
/// (pages/migrate/source-icon.tsx).
const SOURCE_ICON_SIZE: f64 = 112.0;

/// What the user must allow for Wren to read what macOS keeps from it.
const FULL_DISK_ACCESS: &str = "fullDiskAccess";

/// A browser installed with a real profile, as the page lists it; or one
/// whose profiles macOS keeps from Wren, with none until the user allows it.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ListedSource {
    id: &'static str,
    name: &'static str,
    /// Its app's icon's ID (`iconUrl`).
    icon: String,
    keeps_spaces: bool,
    profiles: Vec<ListedProfile>,
    #[serde(skip_serializing_if = "Option::is_none")]
    access: Option<&'static str>,
}

#[derive(Serialize)]
struct ListedProfile {
    id: String,
    name: String,
    /// Where it lands unless the user says otherwise.
    landing: Landing,
    /// Its picture's ID (`iconUrl`), if it has one.
    #[serde(skip_serializing_if = "Option::is_none")]
    picture: Option<String>,
}

/// What a profile has, as the page takes it: a thing it has none of is
/// left out.
#[derive(Serialize)]
pub struct ListedSurvey {
    #[serde(skip_serializing_if = "Option::is_none")]
    spaces: Option<SpaceCount>,
    #[serde(skip_serializing_if = "is_zero")]
    bookmarks: usize,
    #[serde(skip_serializing_if = "is_zero")]
    history: usize,
    /// Sites with cookies.
    #[serde(skip_serializing_if = "is_zero")]
    cookies: usize,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    extensions: Vec<ListedExtension>,
    /// What the user must allow for Wren to read the rest.
    #[serde(skip_serializing_if = "Option::is_none")]
    access: Option<&'static str>,
}

#[derive(Serialize)]
struct ListedExtension {
    id: String,
    name: String,
    /// Its icon's ID (`iconUrl`); empty if it has none.
    icon: String,
    enabled: bool,
}

fn is_zero(count: &usize) -> bool {
    *count == 0
}

/// Where a page is: `here`, the profile it is in, if it is in one.
pub fn context(mt: MainThread, here: Option<&Profile>, incognito: bool) -> Context {
    let listed = mt.profile_list();
    let id = here.map(Profile::id);
    Context {
        incognito,
        profile: listed
            .iter()
            .find(|entry| Some(&entry.id) == id.as_ref())
            .map(WrenProfile::from),
        profiles: listed.iter().map(WrenProfile::from).collect(),
    }
}

/// The browsers installed with a real profile, or whose profiles macOS
/// keeps from Wren until the user allows it, each with its profiles and
/// where each lands unless the user says otherwise: `answer` gets them.
/// `here` is the Wren profile the page is in, if it is in one. The apps'
/// icons are drawn here; their profiles are read on a thread.
pub fn sources(
    mt: MainThread,
    here: Option<String>,
    answer: impl FnOnce(Vec<ListedSource>) + 'static,
) {
    let installed = super::installed_sources(SOURCE_ICON_SIZE);
    let wren = mt.profile_list();
    on_a_thread(
        move || {
            installed
                .into_iter()
                .filter_map(|(source, icon)| {
                    let (profiles, access) = match source.profiles() {
                        Ok(found) if !found.is_empty() => (found, None),
                        Err(ReadError::NoAccess) => (Vec::new(), Some(FULL_DISK_ACCESS)),
                        _ => return None,
                    };
                    // Each with its picture's PNG, read here, off the main
                    // thread.
                    let profiles: Vec<_> = profiles
                        .into_iter()
                        .map(|profile| {
                            let picture = profile
                                .picture
                                .as_ref()
                                .and_then(|file| std::fs::read(file).ok());
                            (profile, picture)
                        })
                        .collect();
                    Some((source, icon, profiles, access))
                })
                .collect::<Vec<_>>()
        },
        move |_, found| {
            let listed = found
                .into_iter()
                .map(|(source, icon, profiles, access)| {
                    let about = source.about();
                    ListedSource {
                        id: about.id,
                        name: about.name,
                        icon: icons::id(icon),
                        keeps_spaces: source.keeps_spaces(),
                        profiles: profiles
                            .into_iter()
                            .map(|(profile, picture)| ListedProfile {
                                id: profile.id.clone(),
                                name: shown_name(&profile, about.name),
                                landing: suggested_landing(
                                    &profile,
                                    about.name,
                                    here.as_deref(),
                                    &wren,
                                ),
                                picture: picture.map(icons::id),
                            })
                            .collect(),
                        access,
                    }
                })
                .collect();
            answer(listed);
        },
    );
}

/// What profile `profile` of source `source` has: `answer` gets it, or why
/// it could not be read.
pub fn survey(
    source: &str,
    profile: String,
    answer: impl FnOnce(Result<ListedSurvey, String>) + 'static,
) {
    let Some(source) = super::source(source) else {
        return answer(Err("That browser is not installed.".into()));
    };
    on_a_thread(
        move || {
            let profile = source.profile(&profile).ok()??;
            Some(source.survey(&profile))
        },
        |_, survey| {
            answer(
                survey
                    .map(listed_survey)
                    .ok_or_else(|| "That profile is not there now.".into()),
            )
        },
    );
}

// A source's profile's name as Wren shows it: one the source named itself
// ("Person 1") is named for the source.
fn shown_name(profile: &SourceProfile, source: &str) -> String {
    if profile.default_name {
        source.to_owned()
    } else {
        profile.name.clone()
    }
}

// Where a source's profile lands unless the user says otherwise: the Wren
// profile of its name it came into before, if there is one other than
// `here` (the profile bringing it over), or else a new one of its name.
fn suggested_landing(
    profile: &SourceProfile,
    source: &str,
    here: Option<&str>,
    wren: &[ProfileListEntry],
) -> Landing {
    let name = shown_name(profile, source);
    match wren.iter().find(|existing| {
        existing.name.eq_ignore_ascii_case(&name) && Some(existing.id.as_str()) != here
    }) {
        Some(existing) => Landing::Existing {
            id: existing.id.clone(),
        },
        None => Landing::New { name },
    }
}

// Its extensions' icons are named for the page to fetch.
fn listed_survey(survey: Survey) -> ListedSurvey {
    ListedSurvey {
        spaces: survey.spaces.filter(|count| count.spaces > 0),
        bookmarks: survey.bookmarks,
        history: survey.history,
        cookies: survey.cookie_sites,
        extensions: survey
            .extensions
            .into_iter()
            .map(|extension| ListedExtension {
                id: extension.id,
                name: extension.name,
                icon: extension.icon.map(icons::id).unwrap_or_default(),
                enabled: extension.enabled,
            })
            .collect(),
        access: survey.no_access.then_some(FULL_DISK_ACCESS),
    }
}

/// What waits on a thread's answer, which cannot leave the main thread.
type Waiting = Box<dyn FnOnce(MainThread, Box<dyn Any + Send>)>;

thread_local! {
    static WAITING: RefCell<HashMap<u64, Waiting>> = RefCell::default();
    static NEXT: Cell<u64> = const { Cell::new(0) };
}

// Does `work` on a thread of its own, then gives what it made to `then` on
// the main thread.
fn on_a_thread<T: Send + 'static>(
    work: impl FnOnce() -> T + Send + 'static,
    then: impl FnOnce(MainThread, T) + 'static,
) {
    let id = NEXT.with(|next| next.replace(next.get() + 1));
    let waiting: Waiting = Box::new(move |mt, value| {
        if let Ok(value) = value.downcast::<T>() {
            then(mt, *value);
        }
    });
    WAITING.with(|all| all.borrow_mut().insert(id, waiting));
    std::thread::spawn(move || {
        let value = work();
        let _ = wren::post_to_main_thread(move |mt| {
            if let Some(then) = WAITING.with(|all| all.borrow_mut().remove(&id)) {
                then(mt, Box::new(value));
            }
        });
    });
}
