// wren://migrate's calls, which come through Wren Components
// (extensions/bridge.rs), not `wren.invoke`: it is a page in a tab.
// src/renderer/ipc/migrate.ts is the page's side. What reads another
// browser's files does so on a thread, and answers from the main thread.

use std::cell::{Cell, RefCell};
use std::collections::HashMap;
use std::rc::{Rc, Weak};

use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use wren::MainThread;

use crate::app::State;
use crate::extensions::bridge::{self, Call};
use crate::import::run::{self, Plan, RunState};
use crate::import::{self, Source, SourceProfile, Survey};
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
    // and where each lands unless the user says otherwise.
    bridge::handle_call(&MIGRATE, "migrate.sources", move |call| {
        let installed = import::installed_sources();
        let here = call.profile().map(|profile| profile.id());
        let names: Vec<(String, String)> = wren_profiles(mt)
            .into_iter()
            .map(|p| (p.id, p.name))
            .collect();
        let icons: Vec<(String, Vec<u8>)> = installed
            .iter()
            .map(|(source, png)| (source.about().id.to_owned(), png.clone()))
            .collect();
        let sources: Vec<&'static dyn Source> =
            installed.into_iter().map(|(source, _)| source).collect();
        on_a_thread(
            call,
            move || {
                sources
                    .into_iter()
                    .filter_map(|source| {
                        let profiles = source
                            .profiles()
                            .ok()
                            .filter(|profiles| !profiles.is_empty())?;
                        Some((source, profiles))
                    })
                    .collect::<Vec<_>>()
            },
            move |_, call, found| {
                let listed: Vec<Value> = found
                    .into_iter()
                    .map(|(source, profiles)| {
                        let about = source.about();
                        let icon = icons
                            .iter()
                            .find(|(id, _)| id == about.id)
                            .map(|(_, png)| icons::id(png.clone()))
                            .unwrap_or_default();
                        json!({
                            "id": about.id,
                            "name": about.name,
                            "icon": icon,
                            "keepsSpaces": source.keeps_spaces(),
                            "profiles": profiles
                                .iter()
                                .map(|profile| json!({
                                    "id": profile.id,
                                    "name": shown_name(profile, about.name),
                                    "inUse": profile.in_use,
                                    "landing": landing(profile, about.name, here.as_deref(), &names),
                                }))
                                .collect::<Vec<_>>(),
                        })
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
                Some(survey) => call.answer(Ok(survey_json(survey))),
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

// Where a profile lands unless the user says otherwise: the one in use, in
// the tab's profile; another, in the Wren profile of its name, or a new one.
fn landing(
    profile: &SourceProfile,
    source: &str,
    here: Option<&str>,
    wren: &[(String, String)],
) -> Value {
    if profile.in_use {
        return json!({ "kind": "this" });
    }
    let name = shown_name(profile, source);
    match wren
        .iter()
        .find(|(id, existing)| existing.eq_ignore_ascii_case(&name) && Some(id.as_str()) != here)
    {
        Some((id, _)) => json!({ "kind": "existing", "id": id }),
        None => json!({ "kind": "new", "name": name }),
    }
}

// What a profile has, as the page takes it: a thing it has none of is
// left out; its extensions' icons are named for the page to fetch.
fn survey_json(survey: Survey) -> Value {
    let mut out = serde_json::Map::new();
    if let Some((spaces, pins)) = survey.spaces
        && spaces > 0
    {
        out.insert("spaces".into(), json!({ "spaces": spaces, "pins": pins }));
    }
    for (key, count) in [
        ("bookmarks", survey.bookmarks),
        ("history", survey.history),
        ("cookies", survey.cookies),
    ] {
        if count > 0 {
            out.insert(key.into(), json!(count));
        }
    }
    if !survey.extensions.is_empty() {
        let extensions: Vec<Value> = survey
            .extensions
            .into_iter()
            .map(|extension| {
                json!({
                    "id": extension.id,
                    "name": extension.name,
                    "icon": extension.icon.map(icons::id).unwrap_or_default(),
                    "enabled": extension.enabled,
                })
            })
            .collect();
        out.insert("extensions".into(), json!(extensions));
    }
    if survey.no_access {
        out.insert("access".into(), json!("fullDiskAccess"));
    }
    Value::Object(out)
}
