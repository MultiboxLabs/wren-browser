// The spaces: finding the one a window opens on, making, changing, ordering
// and deleting them, and what follows a change to them. A space belongs to
// a profile, and goes when it does (db/spaces.rs keeps them). Which space a
// window shows, and switching it, is windows/'s.

use std::rc::Rc;

use wren::{Browser, Error, MainThread, Profile};

use crate::analytics::{Event, SpaceField};
use crate::app::State;
use crate::db::{NewSpace, SpaceChange, SpaceId, SpaceRow};
use crate::ipc;
use crate::menus;
use crate::windows::{self, Place};

/// The profile's most recently used space, if it has one. A profile
/// Chromium has just made is not in the database yet: it is added, with
/// no space, so a window on it can be kept.
pub fn recent(state: &State, mt: MainThread, profile: &Profile) -> Option<SpaceId> {
    let id = profile.id();
    let recent = || match state.db.recent_space(&id) {
        Ok(space) => space.map(|space| space.id),
        Err(error) => {
            eprintln!("Wren could not read the spaces: {error}");
            None
        }
    };
    recent().or_else(|| {
        if state.db.sync_profiles(&mt.profile_list()) {
            changed(state);
        }
        recent()
    })
}

/// Every space, in the user's order, of any profile. Each is named, with
/// its profile's name when there is more than one.
pub fn ordered(state: &State, mt: MainThread) -> Vec<(SpaceId, String)> {
    let profiles = mt.profile_list();
    let spaces = match state.db.list_spaces() {
        Ok(spaces) => spaces,
        Err(error) => {
            eprintln!("Wren could not read the spaces: {error}");
            Vec::new()
        }
    };
    let many = spaces
        .windows(2)
        .any(|pair| pair[0].profile != pair[1].profile);
    spaces
        .into_iter()
        .map(|space| {
            let owner = profiles.iter().find(|entry| entry.id == space.profile);
            let name = match owner {
                Some(owner) if many => format!("{} — {}", space.name, owner.name),
                _ => space.name,
            };
            (space.id, name)
        })
        .collect()
}

/// Whether `space` is one of `profile`'s, and still there.
pub fn is_of(state: &State, space: SpaceId, profile: &Profile) -> bool {
    matches!(state.db.space(space), Ok(Some(row)) if row.profile == profile.id())
}

/// Notes that `space` is in use now.
pub fn touch(state: &State, space: SpaceId) {
    if let Err(error) = state.db.touch_space(space) {
        eprintln!("Wren could not note a space's use: {error}");
    }
}

/// Makes a space at the end of `profile`'s, if the profile is still there.
pub fn create(
    state: &State,
    mt: MainThread,
    profile: &str,
    space: NewSpace,
) -> Result<SpaceRow, String> {
    if !mt.profile_list().iter().any(|entry| entry.id == profile) {
        return Err("That profile is gone.".to_owned());
    }
    let space = state.db.create_space(profile, space)?;
    state.analytics.record(Event::SpaceCreated);
    changed(state);
    Ok(space)
}

/// Changes what `change` has of space `id`, and gives it as it is now.
pub fn update(state: &State, id: SpaceId, change: SpaceChange) -> Result<SpaceRow, String> {
    let fields = [
        (change.name.is_some(), SpaceField::Name),
        (change.icon.is_some(), SpaceField::Icon),
        (change.theme.is_some(), SpaceField::Theme),
    ];
    let space = state.db.update_space(id, change)?;
    for (_, field) in fields.into_iter().filter(|(changed, _)| *changed) {
        state.analytics.record(Event::SpaceCustomized { field });
    }
    changed(state);
    Ok(space)
}

/// Moves space `id` to its place among every space, of any profile.
pub fn reorder(state: &State, id: SpaceId, index: usize) -> Result<(), String> {
    state.db.move_space(id, index)?;
    changed(state);
    Ok(())
}

/// Deletes `space` once its Browsers, in every window, have closed with
/// their tabs, all or none: a page's "Leave site?" asks first, its window
/// switching to the space to show it (windows/switch.rs), and Stay keeps
/// the space. Then each window on it switches to the most recently used
/// space of its profile left. `done` hears how it ended. The app's last
/// space is refused before anything closes.
pub fn delete(state: &Rc<State>, space: SpaceId, done: impl FnOnce(Result<(), String>) + 'static) {
    let profile = match state.db.space(space) {
        Ok(Some(row)) => row.profile,
        Ok(None) => return done(Err("That space is gone.".into())),
        Err(error) => return done(Err(error)),
    };
    match state.db.list_spaces() {
        Ok(spaces) if spaces.len() <= 1 => {
            return done(Err("Wren needs at least one space.".into()));
        }
        Ok(_) => {}
        Err(error) => return done(Err(error)),
    }
    let place = Place::Space(space);
    let browsers: Vec<Browser> = state
        .windows
        .all()
        .iter()
        .filter_map(|window| window.browser_of(&place))
        .collect();
    let state = Rc::downgrade(state);
    let delete = move || {
        let state = state.upgrade().ok_or("Wren is quitting.")?;
        state.db.delete_space(space)?;
        state.analytics.record(Event::SpaceDeleted);
        windows::leave_gone_spaces(&state, Some(&profile));
        changed(&state);
        Ok(())
    };
    if browsers.is_empty() {
        return done(delete());
    }
    Browser::close_all(&browsers, move |result| {
        done(match result {
            Ok(()) => delete(),
            Err(Error::Cancelled) => Err("A page kept the space open.".into()),
            Err(error) => Err(format!("Wren could not close the space's tabs: {error:?}")),
        })
    });
}

/// The space to go to from a deleted one: `profile`'s most recently
/// used, or with none, the most recently used of all.
pub fn left(state: &State, profile: Option<&str>) -> Result<SpaceId, String> {
    let of_profile = match profile {
        Some(profile) => state.db.recent_space(profile)?,
        None => None,
    };
    let next = match of_profile {
        Some(space) => Some(space),
        None => state.db.most_recent_space()?,
    };
    next.map(|space| space.id)
        .ok_or_else(|| "No space is left.".into())
}

/// The spaces changed, or a profile's name, which they are listed with: the
/// main menu lists them anew, every window's page is told to read them
/// again, and each window is named again, as one with no tab is named for
/// its space.
pub fn changed(state: &State) {
    if let Some(mt) = MainThread::get() {
        menus::update_main_menu(state, mt);
    }
    ipc::broadcast_spaces(state);
    for window in state.windows.all() {
        windows::update_title(state, &window);
    }
}
