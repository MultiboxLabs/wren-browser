// The calls that bring the user's things over from another browser, which
// two pages make alike (`handle_calls`): wren://migrate, whose come through
// Wren Components (extensions/bridge.rs) as it is a page in a tab
// (`handle_migrate`), and onboarding's window, whose come as any web view's
// (`handle_migrate_in`). Only where each page is, and how it starts a run,
// differ. What they list is import/listing.rs's, and the run
// import/run.rs's. src/renderer/ipc/migrate.ts is the pages' side.

use std::rc::Rc;

use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use wren::{MainThread, Profile, WebView};

use crate::app::State;
use crate::extensions::bridge;
use crate::import::listing;
use crate::import::run::{self, Plan, RunState};
use crate::pages::{MIGRATE, Page};
use crate::platform::{self, Privacy};

#[derive(Deserialize)]
struct SurveyArgs {
    source: String,
    profile: String,
}

/// Where a call comes from: the profile its page is in, if any, and
/// whether its tab is incognito.
struct Here {
    profile: Option<Profile>,
    incognito: bool,
}

/// Answers a call, then or later: its value, or why there is none.
type Answer<A> = Box<dyn FnOnce(Result<A, String>)>;

/// What carries a page's calls to the app.
trait Link {
    /// Answers the page's call `name` with `handler`, given where the call
    /// comes from and what the page passed as `V`.
    fn on<V, A>(&self, name: &str, handler: impl Fn(Here, V, Answer<A>) + 'static)
    where
        V: DeserializeOwned + 'static,
        A: Serialize + 'static;
}

/// A page in a tab, through Wren Components.
impl Link for &'static Page {
    fn on<V, A>(&self, name: &str, handler: impl Fn(Here, V, Answer<A>) + 'static)
    where
        V: DeserializeOwned + 'static,
        A: Serialize + 'static,
    {
        bridge::handle_call(self, name, move |call| {
            let here = Here {
                profile: call.profile(),
                incognito: call.incognito(),
            };
            match call.args::<V>() {
                Ok(args) => handler(here, args, Box::new(move |result| call.answer(result))),
                Err(error) => call.answer::<A>(Err(error)),
            }
        });
    }
}

/// A window of the app's own, in no profile of the user's.
impl Link for &WebView {
    fn on<V, A>(&self, name: &str, handler: impl Fn(Here, V, Answer<A>) + 'static)
    where
        V: DeserializeOwned + 'static,
        A: Serialize + 'static,
    {
        let _ = self.handle_call(name, move |call| {
            let here = Here {
                profile: None,
                incognito: false,
            };
            let args = call.value::<V>();
            // A page that went before its answer is no error.
            let answer: Answer<A> = Box::new(move |result| {
                let _ = match result {
                    Ok(value) => call.answer(&value),
                    Err(error) => call.fail(&error),
                };
            });
            match args {
                Ok(args) => handler(here, args, answer),
                Err(error) => answer(Err(error.to_string())),
            }
        });
    }
}

/// wren://migrate's calls. A run lands `Landing::This` in the profile the
/// page's tab is in.
pub fn handle_migrate(mt: MainThread, state: &Rc<State>) {
    let weak = Rc::downgrade(state);
    handle_calls(&MIGRATE, mt, move |here, plan| {
        if here.incognito {
            return Err("Open wren://migrate in a normal window to bring your things over.".into());
        }
        let state = weak.upgrade().ok_or("The app is closing.")?;
        let this = here.profile.ok_or("The page's profile is gone.")?;
        run::start(&state, Some(this), plan, None)
    });
}

/// Onboarding's calls. Its run lands each profile in a new one, and its
/// progress comes to the window (`State::import_in_onboarding`).
pub fn handle_migrate_in(web_view: &WebView, state: &Rc<State>, mt: MainThread) {
    let weak = Rc::downgrade(state);
    handle_calls(web_view, mt, move |_, plan| {
        let state = weak.upgrade().ok_or("The app is closing.")?;
        state.import_in_onboarding(mt, plan)
    });
}

// Every call, through `link`, with `start` to start a run.
fn handle_calls(
    link: impl Link,
    mt: MainThread,
    start: impl Fn(Here, Plan) -> Result<RunState, String> + 'static,
) {
    link.on("migrate.context", move |here, (), answer| {
        answer(Ok(listing::context(
            mt,
            here.profile.as_ref(),
            here.incognito,
        )));
    });

    link.on("migrate.sources", move |here, (), answer| {
        let here = here.profile.map(|profile| profile.id());
        listing::sources(mt, here, move |listed| answer(Ok(listed)));
    });

    link.on("migrate.survey", |_, args: SurveyArgs, answer| {
        listing::survey(&args.source, args.profile, answer);
    });

    link.on("migrate.start", move |here, plan: Plan, answer| {
        answer(start(here, plan));
    });

    link.on("migrate.run", |_, (), answer| {
        answer(Ok::<Option<RunState>, String>(run::current()));
    });

    link.on("migrate.openAccessSettings", |_, (), answer| {
        platform::open_privacy_settings(Privacy::FullDiskAccess);
        answer(Ok(()));
    });
}
