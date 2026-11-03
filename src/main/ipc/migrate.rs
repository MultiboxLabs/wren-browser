// wren://migrate's calls, which come through Wren Components
// (extensions/bridge.rs), not `wren.invoke`: it is a page in a tab.
// src/renderer/ipc/migrate.ts is the page's side. What reads another
// browser's files does so on a thread, and answers from the main thread.

use std::cell::{Cell, RefCell};
use std::collections::HashMap;
use std::rc::{Rc, Weak};

use serde::{Deserialize, Serialize};
use wren::MainThread;

use crate::app::State;
use crate::extensions::bridge::{self, Call};
use crate::import::run::{self, Plan, RunState};
use crate::import::{self, Landing, SourceProfile, Survey};
use crate::pages::{MIGRATE, icons};
use crate::platform::{self, Privacy};

/// A profile of the user's in Wren.
#[derive(Serialize)]
struct WrenProfile {
    id: String,
    name: String,
}

/// Where the page is: whether its tab is incognito, the profile its tab is
/// in (an incognito tab's original), and every profile there is, which the
/// user's other profiles may land in.
#[derive(Serialize)]
struct Context {
    incognito: bool,
    profile: Option<WrenProfile>,
    profiles: Vec<WrenProfile>,
}

/// A browser installed with a real profile, as the page lists it.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ListedSource {
    id: &'static str,
    name: &'static str,
    /// Its app's icon's ID (`iconUrl`).
    icon: String,
    keeps_spaces: bool,
    profiles: Vec<ListedProfile>,
}

#[derive(Serialize)]
struct ListedProfile {
    id: String,
    name: String,
    /// Where it lands unless the user says otherwise.
    landing: Landing,
}

/// What a profile has, as the page takes it: a thing it has none of is
/// left out.
#[derive(Serialize)]
struct ListedSurvey {
    #[serde(skip_serializing_if = "Option::is_none")]
    spaces: Option<SpaceCount>,
    #[serde(skip_serializing_if = "is_zero")]
    bookmarks: usize,
    #[serde(skip_serializing_if = "is_zero")]
    history: usize,
    #[serde(skip_serializing_if = "is_zero")]
    cookies: usize,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    extensions: Vec<ListedExtension>,
    /// What the user must allow for Wren to read the rest.
    #[serde(skip_serializing_if = "Option::is_none")]
    access: Option<&'static str>,
}

#[derive(Serialize)]
struct SpaceCount {
    spaces: usize,
    pins: usize,
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

#[derive(Deserialize)]
struct SurveyArgs {
    source: String,
    profile: String,
}

thread_local! {
    // The calls waiting on a thread's answer, which cannot leave the main
    // thread.
    static WAITING: RefCell<HashMap<u64, Call>> = RefCell::default();
    static NEXT: Cell<u64> = const { Cell::new(0) };
}

// Does `work` on a thread of its own, then answers `call` with `answer` on
// the main thread.
fn on_a_thread<T: Send + 'static>(
    call: Call,
    work: impl FnOnce() -> T + Send + 'static,
    answer: impl FnOnce(MainThread, Call, T) + Send + 'static,
) {
    let id = NEXT.with(|next| next.replace(next.get() + 1));
    WAITING.with(|waiting| waiting.borrow_mut().insert(id, call));
    std::thread::spawn(move || {
        let value = work();
        let _ = wren::post_to_main_thread(move |mt| {
            if let Some(call) = WAITING.with(|waiting| waiting.borrow_mut().remove(&id)) {
                answer(mt, call, value);
            }
        });
    });
}

pub fn handle_migrate(mt: MainThread, state: &Rc<State>) {
    bridge::handle(&MIGRATE, "migrate.context", move |call, ()| {
        let profiles = wren_profiles(mt);
        let id = call.profile().map(|profile| profile.id());
        let profile = profiles
            .iter()
            .find(|profile| Some(&profile.id) == id.as_ref())
            .map(|profile| WrenProfile {
                id: profile.id.clone(),
                name: profile.name.clone(),
            });
        Ok(Context {
            incognito: call.incognito(),
            profile,
            profiles,
        })
    });

    // The browsers installed with a real profile, each with its profiles
    // and where each lands unless the user says otherwise. The apps' icons
    // are drawn here; their profiles are read on a thread.
    bridge::handle_call(&MIGRATE, "migrate.sources", move |call| {
        let installed = import::installed_sources();
        let here = call.profile().map(|profile| profile.id());
        let wren = wren_profiles(mt);
        on_a_thread(
            call,
            move || {
                installed
                    .into_iter()
                    .filter_map(|(source, icon)| {
                        let profiles = source.profiles().ok().filter(|found| !found.is_empty())?;
                        Some((source, icon, profiles))
                    })
                    .collect::<Vec<_>>()
            },
            move |_, call, found| {
                let listed: Vec<ListedSource> = found
                    .into_iter()
                    .map(|(source, icon, profiles)| {
                        let about = source.about();
                        ListedSource {
                            id: about.id,
                            name: about.name,
                            icon: icons::id(icon),
                            keeps_spaces: source.keeps_spaces(),
                            profiles: profiles
                                .iter()
                                .map(|profile| ListedProfile {
                                    id: profile.id.clone(),
                                    name: shown_name(profile, about.name),
                                    landing: landing(profile, about.name, here.as_deref(), &wren),
                                })
                                .collect(),
                        }
                    })
                    .collect();
                call.answer(Ok(listed));
            },
        );
    });

    // What one of a source's profiles has.
    bridge::handle_call(&MIGRATE, "migrate.survey", move |call| {
        let args = match call.args::<SurveyArgs>() {
            Ok(args) => args,
            Err(error) => return call.answer::<()>(Err(error)),
        };
        let Some(source) = import::source(&args.source) else {
            return call.answer::<()>(Err("That browser is not installed.".into()));
        };
        on_a_thread(
            call,
            move || {
                let profile = source
                    .profiles()
                    .ok()?
                    .into_iter()
                    .find(|profile| profile.id == args.profile)?;
                Some(source.survey(&profile))
            },
            |_, call, survey| match survey {
                Some(survey) => call.answer(Ok(listed_survey(survey))),
                None => call.answer::<()>(Err("That profile is not there now.".into())),
            },
        );
    });

    // Starts bringing it over, into the profile the page's tab is in.
    let weak: Weak<State> = Rc::downgrade(state);
    bridge::handle(&MIGRATE, "migrate.start", move |call, plan: Plan| {
        if call.incognito() {
            return Err("Open wren://migrate in a normal window to bring your things over.".into());
        }
        let state = weak.upgrade().ok_or("The app is closing.")?;
        let this = call.profile().ok_or("The page's profile is gone.")?;
        run::start(&state, this, plan)
    });

    bridge::handle(&MIGRATE, "migrate.run", |_, ()| {
        Ok::<Option<RunState>, String>(run::current())
    });

    bridge::handle(&MIGRATE, "migrate.openAccessSettings", |_, ()| {
        platform::open_privacy_settings(Privacy::FullDiskAccess);
        Ok(())
    });
}

fn wren_profiles(mt: MainThread) -> Vec<WrenProfile> {
    mt.profile_list()
        .into_iter()
        .map(|entry| WrenProfile {
            id: entry.id,
            name: entry.name,
        })
        .collect()
}

// A profile the source named itself ("Person 1") is named for the source.
fn shown_name(profile: &SourceProfile, source: &str) -> String {
    if profile.default_name {
        source.to_owned()
    } else {
        profile.name.clone()
    }
}

// Where a profile lands unless the user says otherwise: a new Wren profile
// of its name, or the one it came into before, of that name.
fn landing(
    profile: &SourceProfile,
    source: &str,
    here: Option<&str>,
    wren: &[WrenProfile],
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
        spaces: survey
            .spaces
            .filter(|(spaces, _)| *spaces > 0)
            .map(|(spaces, pins)| SpaceCount { spaces, pins }),
        bookmarks: survey.bookmarks,
        history: survey.history,
        cookies: survey.cookies,
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
        access: survey.no_access.then_some("fullDiskAccess"),
    }
}
