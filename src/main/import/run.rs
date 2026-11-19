// The one run of bringing things over, which the app keeps, not the page: a
// page that opens during it shows it, and it goes on if its tab closes.
//
// It first reads, on a thread, which of the source's profiles come and how
// much each has (the totals the page shows progress against); then opens or
// makes the Wren profile each lands in; then brings each thing over in the
// page's order, profile by profile. A thing is read on a thread of its own
// and handed to the main thread in batches, where Wren takes it; the next
// step starts once the last batch has landed. Every change goes to the
// open migrate pages (`migrate.progress`), and to what started the run
// (`Watch`), as onboarding watches the run it starts.

use std::cell::{Cell, RefCell};
use std::collections::{HashMap, HashSet, VecDeque};
use std::rc::{Rc, Weak};

use serde::{Deserialize, Serialize};
use wren::{CookieResult, MainThread, Profile, WebStoreInstallResult};

use super::data::{Bookmarks, Spaces};
use super::land::profiles::{self, Landing};
use super::land::{bookmarks, extensions, spaces};
use super::source::{ReadError, Source, SourceProfile, SpaceSurvey, Survey};
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
    /// It stopped before bringing anything: the source could not be read,
    /// or a profile could not be opened or made.
    pub stopped: bool,
}

/// Told of every change to the run, after the open migrate pages are.
pub type Watch = Rc<dyn Fn(&RunState)>;

/// A source's profile, with what it has, and the Wren profile it lands in.
struct Route {
    from: SourceProfile,
    survey: Survey,
    to: Profile,
    /// `to` was made for it.
    made: bool,
}

/// One step of a run: one thing of one of its routes.
#[derive(Clone, Copy)]
struct Step {
    run: u64,
    /// `Run::routes`' index.
    route: usize,
    thing: Thing,
}

struct Run {
    /// Which run it is, so what a thread of an old one posts is let go.
    id: u64,
    view: RunState,
    app: Weak<State>,
    source: &'static dyn Source,
    /// The page's tab's Wren profile, which `Landing::This` names; none
    /// where there is no such page, as in onboarding.
    this: Option<Profile>,
    watch: Option<Watch>,
    extensions: HashSet<String>,
    routes: Vec<Route>,
    /// The steps to come, each one thing of one route (by its index).
    steps: VecDeque<(usize, Thing)>,
    /// Steps of each thing still to come or going.
    left: HashMap<Thing, usize>,
    /// Why each thing failed, a step at a time, for its note.
    failed: HashMap<Thing, Vec<String>>,
    /// How much of each thing was read but did not land: what could not be
    /// read, and what Wren refused.
    left_out: HashMap<Thing, usize>,
    // The step going: whether its reading is over, and how many of its
    // batches Wren has yet to answer.
    reading: bool,
    pending: usize,
    /// The user would not let Wren have the source's key: nothing else
    /// locked with it is asked for again.
    key_refused: bool,
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

// Out of `RUN`'s borrow, as a watch may read the run.
fn tell(id: u64) {
    let Some((view, watch)) = with(id, |run| (run.view.clone(), run.watch.clone())) else {
        return;
    };
    bridge::send(&MIGRATE, "migrate.progress", &view);
    if let Some(watch) = watch {
        watch(&view);
    }
}

/// Starts bringing `plan` over, `Landing::This` into `this` (the page's
/// tab's), and answers the run as it starts. `watch` is told of every
/// change.
pub fn start(
    app: &Rc<State>,
    this: Option<Profile>,
    plan: Plan,
    watch: Option<Watch>,
) -> Result<RunState, String> {
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
        stopped: false,
    };
    RUN.with(|run| {
        *run.borrow_mut() = Some(Run {
            id,
            view: view.clone(),
            app: Rc::downgrade(app),
            source,
            this,
            watch,
            extensions: plan.extensions.iter().cloned().collect(),
            routes: Vec::new(),
            steps: VecDeque::new(),
            left: HashMap::new(),
            failed: HashMap::new(),
            left_out: HashMap::new(),
            reading: false,
            pending: 0,
            key_refused: false,
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
    let counted = with(id, |run| {
        for progress in &mut run.view.things {
            progress.total = read
                .iter()
                .map(|(_, survey, _)| total(survey, progress.thing, &run.extensions))
                .sum();
        }
        for thing in &things {
            run.left.insert(*thing, read.len());
            for route in 0..read.len() {
                run.steps.push_back((route, *thing));
            }
        }
    });
    if counted.is_none() {
        return;
    }
    tell(id);
    land_profiles(mt, id, read.into_iter().collect());
}

fn total(survey: &Survey, thing: Thing, chosen: &HashSet<String>) -> usize {
    match thing {
        // Spaces locked with the key are counted as they come over.
        Thing::Spaces => match survey.spaces {
            Some(SpaceSurvey::Counted(count)) => count.pins,
            _ => 0,
        },
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

// Whether a profile's `thing` is locked with the source's key, which the
// user is asked for as it is read: its cookies, and its spaces if a survey
// could not count them.
fn locked_with_key(thing: Thing, survey: &Survey) -> bool {
    match thing {
        Thing::Cookies => true,
        Thing::Spaces => survey.spaces == Some(SpaceSurvey::Locked),
        _ => false,
    }
}

fn land_profiles(mt: MainThread, id: u64, mut left: VecDeque<(SourceProfile, Survey, Landing)>) {
    let Some((from, survey, landing)) = left.pop_front() else {
        return next(mt, id);
    };
    let Some((Some(app), this)) = with(id, |run| (run.app.upgrade(), run.this.clone())) else {
        return;
    };
    profiles::resolve(
        mt,
        &app,
        this.as_ref(),
        &landing,
        move |result| match result {
            Ok((to, made)) => {
                with(id, |run| {
                    run.routes.push(Route {
                        from,
                        survey,
                        to,
                        made,
                    })
                });
                land_profiles(mt, id, left);
            }
            Err(error) => fail_all(id, &error),
        },
    );
}

fn fail_all(id: u64, why: &str) {
    with(id, |run| {
        for progress in &mut run.view.things {
            progress.state = Stage::Failed;
            progress.note = Some(why.to_owned());
        }
        run.steps.clear();
        run.view.finished = true;
        run.view.stopped = true;
    });
    tell(id);
}

// The next step, or the run is over.
fn next(mt: MainThread, id: u64) {
    let Some(next) = with(id, |run| run.steps.pop_front()) else {
        return;
    };
    let Some((route, thing)) = next else {
        with(id, |run| run.view.finished = true);
        return tell(id);
    };
    let step = Step {
        run: id,
        route,
        thing,
    };
    let Some((source, from, to, locked, key_refused)) = with(id, |run| {
        run.reading = true;
        run.pending = 0;
        if let Some(progress) = progress(run, thing) {
            progress.state = Stage::Flying;
        }
        let route = &run.routes[route];
        (
            run.source,
            route.from.clone(),
            route.to.clone(),
            locked_with_key(thing, &route.survey),
            run.key_refused,
        )
    }) else {
        return;
    };
    tell(id);
    let name = source.about().name;
    if locked && key_refused {
        return read_over(mt, step, Some(ReadError::Refused.message(name)));
    }
    match thing {
        Thing::History => in_batches(
            step,
            name,
            // History leaves out what it does not keep, and that is no news.
            move |batch| source.history(&from, batch).map(|()| 0),
            |to, batch, landed| {
                to.add_history(batch, move |result| {
                    landed(
                        result
                            .map(Landed::all)
                            .map_err(|error| format!("{error:?}")),
                    )
                })
            },
        ),
        Thing::Cookies => in_batches(
            step,
            name,
            move |batch| source.cookies(&from, batch),
            |to, batch, landed| {
                to.add_cookies(batch, move |result| {
                    landed(
                        result
                            .map(|results| cookies_landed(&results))
                            .map_err(|error| format!("{error:?}")),
                    )
                })
            },
        ),
        // Their favicons are a nicety: without them, the pins come over all
        // the same.
        Thing::Bookmarks => whole(
            step,
            name,
            move || {
                source.bookmarks(&from).map(|bookmarks| {
                    bookmarks
                        .with_favicons(|pages| source.favicons(&from, pages).unwrap_or_default())
                })
            },
            land_bookmarks,
        ),
        Thing::Spaces => whole(
            step,
            name,
            move || {
                source.spaces(&from).map(|spaces| {
                    spaces.with_favicons(|pages| source.favicons(&from, pages).unwrap_or_default())
                })
            },
            land_spaces,
        ),
        Thing::Extensions => install_extensions(mt, step, &to),
    }
}

// Installs the extensions chosen that the step's route has, from the Chrome
// Web Store, into its Wren profile, and pins those the source pinned.
fn install_extensions(mt: MainThread, step: Step, to: &Profile) {
    let chosen: Vec<(String, Option<usize>)> = with(step.run, |run| {
        run.routes[step.route]
            .survey
            .extensions
            .iter()
            .filter(|extension| run.extensions.contains(&extension.id))
            .map(|extension| (extension.id.clone(), extension.pinned))
            .collect()
    })
    .unwrap_or_default();
    if chosen.is_empty() {
        return read_over(mt, step, None);
    }
    with(step.run, |run| run.pending += 1);
    let ids: Vec<String> = chosen.iter().map(|(id, _)| id.clone()).collect();
    let names: Vec<&str> = ids.iter().map(String::as_str).collect();
    let profile = to.clone();
    to.install_from_web_store(&names, move |result| {
        let installed = result
            .map(|results| {
                let installed: Vec<bool> = results
                    .iter()
                    .map(|each| {
                        matches!(
                            each,
                            WebStoreInstallResult::Installed
                                | WebStoreInstallResult::AlreadyInstalled
                        )
                    })
                    .collect();
                let pins = chosen
                    .into_iter()
                    .zip(&installed)
                    .filter_map(|(pin, installed)| installed.then_some(pin))
                    .collect();
                extensions::pin(&profile, pins);
                let missing = installed.iter().filter(|each| !**each).count();
                if missing > 0 {
                    let are = plural(missing, "is", "are");
                    note(
                        step,
                        format!("{missing} {are} not in the Chrome Web Store."),
                    );
                }
                Landed::all(results.len() - missing)
            })
            .map_err(|error| format!("{error:?}"));
        landed_batch(mt, step, installed);
    });
    read_over(mt, step, None);
}

/// Takes Wren's word on a batch: how much of it landed, or why none did.
type BatchLanded = Box<dyn FnOnce(Result<Landed, String>)>;

/// How much of a batch landed, and how much Wren refused.
struct Landed {
    count: usize,
    refused: usize,
}

impl Landed {
    /// `count` landed, and nothing was refused that the user should hear of.
    fn all(count: usize) -> Landed {
        Landed { count, refused: 0 }
    }
}

// What Wren wrote of a batch of cookies, and what it refused. Why each was
// refused goes to the log, as the page says only how many.
fn cookies_landed(results: &[CookieResult]) -> Landed {
    let mut refused: HashMap<String, usize> = HashMap::new();
    for result in results {
        if *result != CookieResult::Written {
            *refused.entry(format!("{result:?}")).or_default() += 1;
        }
    }
    if !refused.is_empty() {
        eprintln!("Wren refused cookies brought over: {refused:?}");
    }
    let count = results.len() - refused.values().sum::<usize>();
    Landed {
        count,
        refused: results.len() - count,
    }
}

// Reads a step's thing on a thread, a batch at a time, and hands each batch
// to Wren (`land`) on the main thread, in the route's Wren profile. `read`
// answers how much it could not read.
fn in_batches<T: Send + 'static>(
    step: Step,
    source: &'static str,
    read: impl FnOnce(&mut dyn FnMut(Vec<T>)) -> Result<usize, ReadError> + Send + 'static,
    land: fn(&Profile, &[T], BatchLanded),
) {
    std::thread::spawn(move || {
        let read = read(&mut |batch| {
            let _ = wren::post_to_main_thread(move |mt| {
                let Some(to) = with(step.run, |run| {
                    run.pending += 1;
                    run.routes[step.route].to.clone()
                }) else {
                    return;
                };
                land(
                    &to,
                    &batch,
                    Box::new(move |result| landed_batch(mt, step, result)),
                );
            });
        });
        let refused = matches!(read, Err(ReadError::Refused));
        let unread = *read.as_ref().unwrap_or(&0);
        let why = read.err().map(|error| error.message(source));
        let _ = wren::post_to_main_thread(move |mt| {
            with(step.run, |run| {
                run.key_refused |= refused;
                *run.left_out.entry(step.thing).or_default() += unread;
            });
            read_over(mt, step, why);
        });
    });
}

// Reads a step's thing whole on a thread, then lands it (`land`) on the
// main thread, in the route's Wren profile.
fn whole<T: Send + 'static>(
    step: Step,
    source: &'static str,
    read: impl FnOnce() -> Result<T, ReadError> + Send + 'static,
    land: fn(MainThread, Step, T) -> Option<String>,
) {
    std::thread::spawn(move || {
        let read = read();
        let refused = matches!(read, Err(ReadError::Refused));
        let _ = wren::post_to_main_thread(move |mt| {
            with(step.run, |run| run.key_refused |= refused);
            let why = match read {
                Ok(read) => land(mt, step, read),
                Err(error) => Some(error.message(source)),
            };
            read_over(mt, step, why);
        });
    });
}

// Lands a route's bookmarks as pins in its Wren profile: why they did not,
// if not.
fn land_bookmarks(mt: MainThread, step: Step, read: Bookmarks) -> Option<String> {
    let (app, to, bar_in_folder) = with(step.run, |run| {
        (
            run.app.upgrade(),
            run.routes[step.route].to.id(),
            run.source.bookmarks_bar_in_folder(),
        )
    })?;
    let Some(entry) = mt.profile_list().into_iter().find(|entry| entry.id == to) else {
        return Some("That profile is gone.".into());
    };
    let count = read.count();
    let added = match bookmarks::land(&app?, &entry, read, bar_in_folder) {
        Ok(added) => added,
        Err(error) => return Some(error),
    };
    landed(step, added);
    let skipped = count.saturating_sub(added);
    if skipped > 0 {
        let were = plural(skipped, "was", "were");
        note(step, format!("{skipped} {were} pinned already."));
    }
    None
}

// Lands a route's spaces in its Wren profile: why they did not, if not.
fn land_spaces(_: MainThread, step: Step, read: Spaces) -> Option<String> {
    let count = read.count();
    let (app, to, made) = with(step.run, |run| {
        // Spaces a survey could not count are counted now, as they are read.
        if run.routes[step.route].survey.spaces == Some(SpaceSurvey::Locked)
            && let Some(progress) = progress(run, step.thing)
        {
            progress.total += count.pins;
        }
        let route = &run.routes[step.route];
        (run.app.upgrade(), route.to.id(), route.made)
    })?;
    let added = match spaces::land(&app?, &to, read, made) {
        Ok(added) => added,
        Err(error) => return Some(error),
    };
    landed(step, added.pins);
    let skipped = added.skipped_spaces;
    if skipped > 0 {
        let were = plural(skipped, "space was", "spaces were");
        note(step, format!("{skipped} {were} there already."));
    }
    None
}

// `one` or `many`, as `count` takes.
fn plural<'a>(count: usize, one: &'a str, many: &'a str) -> &'a str {
    if count == 1 { one } else { many }
}

// So much more of the step's thing has landed.
fn landed(step: Step, count: usize) {
    with(step.run, |run| {
        if let Some(progress) = progress(run, step.thing) {
            progress.done += count;
        }
    });
}

// What the user should know of how the step's thing went, beside its count.
fn note(step: Step, note: String) {
    with(step.run, |run| {
        if let Some(progress) = progress(run, step.thing) {
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
fn landed_batch(mt: MainThread, step: Step, result: Result<Landed, String>) {
    with(step.run, |run| run.pending = run.pending.saturating_sub(1));
    match result {
        Ok(Landed { count, refused }) => {
            with(step.run, |run| {
                *run.left_out.entry(step.thing).or_default() += refused;
            });
            landed(step, count);
        }
        Err(error) => {
            with(step.run, |run| note_failure(run, step.thing, error));
        }
    }
    tell(step.run);
    step_over(mt, step);
}

// The step's reading is over: the step is too, once its batches have landed.
fn read_over(mt: MainThread, step: Step, why: Option<String>) {
    with(step.run, |run| {
        run.reading = false;
        if let Some(why) = why {
            note_failure(run, step.thing, why);
        }
    });
    step_over(mt, step);
}

fn note_failure(run: &mut Run, thing: Thing, why: String) {
    run.failed.entry(thing).or_default().push(why);
}

fn step_over(mt: MainThread, step: Step) {
    let over = with(step.run, |run| {
        if run.reading || run.pending > 0 {
            return false;
        }
        // One more step of the thing is done; with its last, it has landed,
        // or failed if every step of it did.
        let left = run.left.get_mut(&step.thing).map(|left| {
            *left = left.saturating_sub(1);
            *left
        });
        if left != Some(0) {
            return true;
        }
        let failures = run.failed.remove(&step.thing).unwrap_or_default();
        let left_out = run.left_out.remove(&step.thing).unwrap_or_default();
        let every_step_failed = failures.len() >= run.routes.len();
        if let Some(progress) = progress(run, step.thing) {
            progress.state = if every_step_failed {
                Stage::Failed
            } else {
                Stage::Landed
            };
            if let Some(first) = failures.into_iter().next() {
                progress.note = Some(first);
            } else if left_out > 0 {
                progress.note = Some(format!("{left_out} couldn't be brought over."));
            }
            progress.total = progress.total.max(progress.done);
        }
        true
    });
    if over == Some(true) {
        tell(step.run);
        next(mt, step.run);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // What Wren refuses is counted apart from what it writes.
    #[test]
    fn counts_the_cookies_refused() {
        let results = [
            CookieResult::Written,
            CookieResult::Invalid,
            CookieResult::Written,
            CookieResult::Expired,
        ];
        let landed = cookies_landed(&results);
        assert_eq!((landed.count, landed.refused), (2, 2));
    }
}
