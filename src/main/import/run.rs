// The one run of bringing things over, which the app keeps, not the page: a
// page that opens during it shows it, and it goes on if its tab closes.
//
// It first reads, on a thread, which of the source's profiles come and how
// much each has (the totals the page shows progress against); then opens or
// makes the Wren profile each lands in; then brings each thing over in the
// page's order, profile by profile. A thing is read on a thread of its own
// and handed to the main thread in batches, where Wren takes it; the next
// step starts once the last batch has landed. Every change goes to the
// open migrate pages (`migrate.progress`).

use std::cell::{Cell, RefCell};
use std::collections::{HashMap, HashSet, VecDeque};
use std::rc::{Rc, Weak};

use serde::{Deserialize, Serialize};
use wren::{CookieResult, MainThread, Profile, WebStoreInstallResult};

use super::data::{Bookmarks, Spaces};
use super::land::profiles::{self, Landing};
use super::land::{bookmarks, spaces};
use super::source::{ReadError, Source, SourceProfile, Survey};
use crate::app::State;
use crate::extensions::bridge;
use crate::pages::MIGRATE;

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "lowercase")]
pub enum Thing {
    Spaces,
    Bookmarks,
    History,
    Cookies,
    Extensions,
}

/// What the user chose to bring over.
#[derive(Debug, Deserialize)]
pub struct Plan {
    pub source: String,
    pub profiles: Vec<PlanProfile>,
    pub things: Vec<Thing>,
    /// The extensions chosen, by ID.
    pub extensions: Vec<String>,
}

#[derive(Debug, Deserialize)]
pub struct PlanProfile {
    pub id: String,
    pub landing: Landing,
}

#[derive(Clone, Copy, Debug, Serialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum Stage {
    Waiting,
    Flying,
    Landed,
    Failed,
}

#[derive(Clone, Debug, Serialize)]
pub struct ThingProgress {
    pub thing: Thing,
    pub state: Stage,
    pub done: usize,
    pub total: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
}

/// The run, as the page shows it.
#[derive(Clone, Debug, Serialize)]
pub struct RunState {
    pub source: String,
    pub things: Vec<ThingProgress>,
    pub finished: bool,
}

// A source's profile, with what it has, and the Wren profile it lands in.
struct Landed {
    source: SourceProfile,
    survey: Survey,
    profile: Profile,
    made: bool,
}

struct Run {
    /// Which run it is, so what a thread of an old one posts is let go.
    id: u64,
    view: RunState,
    app: Weak<State>,
    source: &'static dyn Source,
    /// The page's tab's Wren profile.
    this: Profile,
    extensions: HashSet<String>,
    profiles: Vec<Landed>,
    /// Each step: one thing of one profile (`profiles`' index).
    steps: VecDeque<(usize, Thing)>,
    /// Steps of each thing still to come or going.
    left: HashMap<Thing, usize>,
    /// Why each thing failed, a step at a time, for its note.
    failed: HashMap<Thing, Vec<String>>,
    // The step going: whether its reading is over, and how many of its
    // batches Wren has yet to answer.
    reading: bool,
    pending: usize,
}

thread_local! {
    static RUN: RefCell<Option<Run>> = const { RefCell::new(None) };
    static NEXT_ID: Cell<u64> = const { Cell::new(1) };
}

/// The run going, or the last one, if there has been one.
pub fn current() -> Option<RunState> {
    RUN.with(|run| run.borrow().as_ref().map(|run| run.view.clone()))
}

fn with<A>(id: u64, f: impl FnOnce(&mut Run) -> A) -> Option<A> {
    RUN.with(|run| run.borrow_mut().as_mut().filter(|run| run.id == id).map(f))
}

fn tell(id: u64) {
    if let Some(view) = with(id, |run| run.view.clone()) {
        bridge::send(&MIGRATE, "migrate.progress", &view);
    }
}

/// Starts bringing `plan` over into the Wren profile `this` (the page's
/// tab's), and answers the run as it starts.
pub fn start(app: &Rc<State>, this: Profile, plan: Plan) -> Result<RunState, String> {
    if current().is_some_and(|run| !run.finished) {
        return Err("Wren is already bringing things over.".into());
    }
    let source = super::source(&plan.source).ok_or("That browser is not installed.")?;
    if plan.profiles.is_empty() || plan.things.is_empty() {
        return Err("There is nothing to bring over.".into());
    }
    let id = NEXT_ID.with(|next| next.replace(next.get() + 1));
    let mut things: Vec<Thing> = Vec::new();
    for thing in &plan.things {
        if !things.contains(thing) {
            things.push(*thing);
        }
    }
    let view = RunState {
        source: plan.source.clone(),
        things: things
            .iter()
            .map(|thing| ThingProgress {
                thing: *thing,
                state: Stage::Waiting,
                done: 0,
                total: 0,
                note: None,
            })
            .collect(),
        finished: false,
    };
    RUN.with(|run| {
        *run.borrow_mut() = Some(Run {
            id,
            view: view.clone(),
            app: Rc::downgrade(app),
            source,
            this,
            extensions: plan.extensions.iter().cloned().collect(),
            profiles: Vec::new(),
            steps: VecDeque::new(),
            left: HashMap::new(),
            failed: HashMap::new(),
            reading: false,
            pending: 0,
        })
    });
    // Which profiles come, and what each has, read on a thread.
    let wanted: Vec<(String, Landing)> = plan
        .profiles
        .into_iter()
        .map(|profile| (profile.id, profile.landing))
        .collect();
    std::thread::spawn(move || {
        let read: Result<Vec<(SourceProfile, Survey, Landing)>, String> = source
            .profiles()
            .map_err(|error| error.message(source.about().name))
            .map(|profiles| {
                wanted
                    .into_iter()
                    .filter_map(|(id, landing)| {
                        let profile = profiles.iter().find(|profile| profile.id == id)?.clone();
                        let survey = source.survey(&profile);
                        Some((profile, survey, landing))
                    })
                    .collect()
            });
        let _ = wren::post_to_main_thread(move |mt| surveyed(mt, id, things, read));
    });
    Ok(view)
}

// What each profile has: the totals; then each lands somewhere, one after
// another.
fn surveyed(
    mt: MainThread,
    id: u64,
    things: Vec<Thing>,
    read: Result<Vec<(SourceProfile, Survey, Landing)>, String>,
) {
    let read = match read {
        Ok(read) if !read.is_empty() => read,
        Ok(_) => return fail_all(id, "None of those profiles are there now."),
        Err(error) => return fail_all(id, &error),
    };
    let ok = with(id, |run| {
        for progress in &mut run.view.things {
            progress.total = read
                .iter()
                .map(|(_, survey, _)| total(survey, progress.thing, &run.extensions))
                .sum();
        }
        for thing in &things {
            run.left.insert(*thing, read.len());
            for index in 0..read.len() {
                run.steps.push_back((index, *thing));
            }
        }
    });
    let Some(this) = ok.and_then(|()| with(id, |run| run.this.clone())) else {
        return;
    };
    tell(id);
    land_profiles(mt, id, this, read.into_iter().collect());
}

fn total(survey: &Survey, thing: Thing, chosen: &HashSet<String>) -> usize {
    match thing {
        Thing::Spaces => survey.spaces.map_or(0, |(_, pins)| pins),
        Thing::Bookmarks => survey.bookmarks,
        Thing::History => survey.history,
        Thing::Cookies => survey.cookies,
        Thing::Extensions => survey
            .extensions
            .iter()
            .filter(|extension| chosen.contains(&extension.id))
            .count(),
    }
}

fn land_profiles(
    mt: MainThread,
    id: u64,
    this: Profile,
    mut left: VecDeque<(SourceProfile, Survey, Landing)>,
) {
    let Some((source, survey, landing)) = left.pop_front() else {
        return next(mt, id);
    };
    let Some(app) = with(id, |run| run.app.upgrade()).flatten() else {
        return;
    };
    let again = this.clone();
    profiles::resolve(mt, &app, &this, &landing, move |result| match result {
        Ok((profile, made)) => {
            with(id, |run| {
                run.profiles.push(Landed {
                    source,
                    survey,
                    profile,
                    made,
                })
            });
            land_profiles(mt, id, again, left);
        }
        Err(error) => fail_all(id, &error),
    });
}

fn fail_all(id: u64, why: &str) {
    with(id, |run| {
        for progress in &mut run.view.things {
            progress.state = Stage::Failed;
            progress.note = Some(why.to_owned());
        }
        run.steps.clear();
        run.view.finished = true;
    });
    tell(id);
}

// The next step: one thing of one profile.
fn next(mt: MainThread, id: u64) {
    let Some(step) = with(id, |run| run.steps.pop_front()) else {
        return;
    };
    let Some((index, thing)) = step else {
        with(id, |run| run.view.finished = true);
        return tell(id);
    };
    with(id, |run| {
        run.reading = true;
        run.pending = 0;
        if let Some(progress) = progress(run, thing) {
            progress.state = Stage::Flying;
        }
    });
    tell(id);
    let Some((source, profile, landed)) = with(id, |run| {
        let landed = &run.profiles[index];
        (run.source, landed.source.clone(), landed.profile.clone())
    }) else {
        return;
    };
    match thing {
        Thing::History => in_batches(
            id,
            index,
            thing,
            source.about().name,
            move |batch| source.history(&profile, batch),
            |target, batch, landed| {
                target.add_history(batch, move |result| {
                    landed(result.map_err(|error| format!("{error:?}")))
                })
            },
        ),
        Thing::Cookies => in_batches(
            id,
            index,
            thing,
            source.about().name,
            move |batch| source.cookies(&profile, batch),
            |target, batch, landed| {
                target.add_cookies(batch, move |result| {
                    landed(
                        result
                            .map(|results| {
                                results
                                    .iter()
                                    .filter(|each| **each == CookieResult::Written)
                                    .count()
                            })
                            .map_err(|error| format!("{error:?}")),
                    )
                })
            },
        ),
        // Their favicons are a nicety: without them, the pins come over all
        // the same.
        Thing::Bookmarks => whole(
            id,
            index,
            thing,
            source.about().name,
            move || {
                source.bookmarks(&profile).map(|bookmarks| {
                    bookmarks
                        .with_favicons(|pages| source.favicons(&profile, pages).unwrap_or_default())
                })
            },
            land_bookmarks,
        ),
        Thing::Spaces => whole(
            id,
            index,
            thing,
            source.about().name,
            move || {
                source.spaces(&profile).map(|spaces| {
                    spaces
                        .with_favicons(|pages| source.favicons(&profile, pages).unwrap_or_default())
                })
            },
            land_spaces,
        ),
        Thing::Extensions => {
            let ids: Vec<String> = with(id, |run| {
                run.profiles[index]
                    .survey
                    .extensions
                    .iter()
                    .filter(|extension| run.extensions.contains(&extension.id))
                    .map(|extension| extension.id.clone())
                    .collect()
            })
            .unwrap_or_default();
            if ids.is_empty() {
                return read_over(mt, id, thing, None);
            }
            with(id, |run| run.pending += 1);
            let names: Vec<&str> = ids.iter().map(String::as_str).collect();
            landed.install_from_web_store(&names, move |result| {
                let installed = result
                    .map(|results| {
                        let missing = results
                            .iter()
                            .filter(|each| {
                                !matches!(
                                    each,
                                    WebStoreInstallResult::Installed
                                        | WebStoreInstallResult::AlreadyInstalled
                                )
                            })
                            .count();
                        if missing > 0 {
                            let verb = if missing == 1 { "is" } else { "are" };
                            note(
                                id,
                                thing,
                                format!("{missing} {verb} not in the Chrome Web Store."),
                            );
                        }
                        results.len() - missing
                    })
                    .map_err(|error| format!("{error:?}"));
                landed_batch(mt, id, thing, installed);
            });
            read_over(mt, id, thing, None);
        }
    }
}

/// Takes Wren's word on a batch: how many of it landed, or why none did.
type BatchLanded = Box<dyn FnOnce(Result<usize, String>)>;

// Reads a thing on a thread, a batch at a time, and hands each batch to
// Wren (`land`) on the main thread, in the step's profile.
fn in_batches<T: Send + 'static>(
    id: u64,
    index: usize,
    thing: Thing,
    source: &'static str,
    read: impl FnOnce(&mut dyn FnMut(Vec<T>)) -> Result<(), ReadError> + Send + 'static,
    land: fn(&Profile, &[T], BatchLanded),
) {
    std::thread::spawn(move || {
        let read = read(&mut |batch| {
            let _ = wren::post_to_main_thread(move |mt| {
                let Some(target) = with(id, |run| {
                    run.pending += 1;
                    run.profiles[index].profile.clone()
                }) else {
                    return;
                };
                land(
                    &target,
                    &batch,
                    Box::new(move |result| landed_batch(mt, id, thing, result)),
                );
            });
        });
        let why = read.err().map(|error| error.message(source));
        let _ = wren::post_to_main_thread(move |mt| read_over(mt, id, thing, why));
    });
}

// Reads a thing whole on a thread, then lands it (`land`) on the main
// thread, in the step's profile.
fn whole<T: Send + 'static>(
    id: u64,
    index: usize,
    thing: Thing,
    source: &'static str,
    read: impl FnOnce() -> Result<T, ReadError> + Send + 'static,
    land: fn(MainThread, u64, usize, T) -> Option<String>,
) {
    std::thread::spawn(move || {
        let read = read();
        let _ = wren::post_to_main_thread(move |mt| {
            let why = match read {
                Ok(read) => land(mt, id, index, read),
                Err(error) => Some(error.message(source)),
            };
            read_over(mt, id, thing, why);
        });
    });
}

// Lands a profile's bookmarks as pins in its Wren profile: why they did
// not, if not.
fn land_bookmarks(mt: MainThread, id: u64, index: usize, read: Bookmarks) -> Option<String> {
    let (app, target) = with(id, |run| {
        (run.app.upgrade(), run.profiles[index].profile.id())
    })?;
    let Some(entry) = mt
        .profile_list()
        .into_iter()
        .find(|entry| entry.id == target)
    else {
        return Some("That profile is gone.".into());
    };
    let count = read.count();
    let added = match bookmarks::land(&app?, &entry, read) {
        Ok(added) => added,
        Err(error) => return Some(error),
    };
    landed(id, Thing::Bookmarks, added);
    let skipped = count.saturating_sub(added);
    if skipped > 0 {
        let were = if skipped == 1 { "was" } else { "were" };
        note(
            id,
            Thing::Bookmarks,
            format!("{skipped} {were} pinned already."),
        );
    }
    None
}

// Lands a profile's spaces in its Wren profile: why they did not, if not.
fn land_spaces(_: MainThread, id: u64, index: usize, read: Spaces) -> Option<String> {
    let (app, target, made) = with(id, |run| {
        let landed = &run.profiles[index];
        (run.app.upgrade(), landed.profile.id(), landed.made)
    })?;
    let added = match spaces::land(&app?, &target, read, made) {
        Ok(added) => added,
        Err(error) => return Some(error),
    };
    landed(id, Thing::Spaces, added.pins);
    let skipped = added.skipped_spaces;
    if skipped > 0 {
        let were = if skipped == 1 {
            "space was"
        } else {
            "spaces were"
        };
        note(
            id,
            Thing::Spaces,
            format!("{skipped} {were} there already."),
        );
    }
    None
}

// So much more of a thing has landed.
fn landed(id: u64, thing: Thing, count: usize) {
    with(id, |run| {
        if let Some(progress) = progress(run, thing) {
            progress.done += count;
        }
    });
}

// What the user should know of how a thing went, beside its count.
fn note(id: u64, thing: Thing, note: String) {
    with(id, |run| {
        if let Some(progress) = progress(run, thing) {
            progress.note = Some(note);
        }
    });
}

fn progress(run: &mut Run, thing: Thing) -> Option<&mut ThingProgress> {
    run.view
        .things
        .iter_mut()
        .find(|progress| progress.thing == thing)
}

// Wren took a batch: so much more has landed, or it failed.
fn landed_batch(mt: MainThread, id: u64, thing: Thing, result: Result<usize, String>) {
    with(id, |run| {
        run.pending = run.pending.saturating_sub(1);
        match result {
            Ok(count) => {
                if let Some(progress) = progress(run, thing) {
                    progress.done += count;
                }
            }
            Err(error) => note_failure(run, thing, error),
        }
    });
    tell(id);
    step_over(mt, id, thing);
}

// The step's reading is over: the step is too, once its batches have landed.
fn read_over(mt: MainThread, id: u64, thing: Thing, why: Option<String>) {
    with(id, |run| {
        run.reading = false;
        if let Some(why) = why {
            note_failure(run, thing, why);
        }
    });
    step_over(mt, id, thing);
}

fn note_failure(run: &mut Run, thing: Thing, why: String) {
    run.failed.entry(thing).or_default().push(why);
}

fn step_over(mt: MainThread, id: u64, thing: Thing) {
    let over = with(id, |run| {
        if run.reading || run.pending > 0 {
            return false;
        }
        // One more step of the thing is done; with its last, it has landed,
        // or failed if every step of it did.
        let left = run.left.get_mut(&thing).map(|left| {
            *left = left.saturating_sub(1);
            *left
        });
        if left != Some(0) {
            return true;
        }
        let failures = run.failed.remove(&thing).unwrap_or_default();
        let every_step_failed = failures.len() >= run.profiles.len();
        if let Some(progress) = progress(run, thing) {
            progress.state = if every_step_failed {
                Stage::Failed
            } else {
                Stage::Landed
            };
            if let Some(first) = failures.into_iter().next() {
                progress.note = Some(first);
            }
            progress.total = progress.total.max(progress.done);
        }
        true
    });
    if over == Some(true) {
        tell(id);
        next(mt, id);
    }
}
