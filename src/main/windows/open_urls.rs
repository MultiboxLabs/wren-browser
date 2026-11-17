// What macOS asks the app to open: a link clicked in another app while Wren
// is the default browser, or a page opened with it. Each opens in a Mini
// Wren of its own (popup.rs), in front, from the space of the window the
// user browses in, or else the space used last, so it never adds to a
// space's tabs unless the user opens it as a tab. A link that launches the
// app comes before its profile has opened, and one may come while a
// profile's last session is being restored, which brings forward what it
// had active: either is held, and opens once startup and the restore are
// done (`open_held`).
//
// A Mini Wren a link opened keeps the app that sent it. If it closes while
// it is the window in use, and the user has gone to no other window of the
// app since it opened, that app comes back to the front, as if the Mini
// Wren had been a part of it.

use std::rc::Rc;

use wren::{MainThread, RequestedBounds};

use super::popup::PAGE_SIZE;
use crate::app::State;
use crate::platform;
use crate::shell::{BrowserWindow, Place, WindowId};

/// The app that sent a link, as macOS names it.
#[derive(Clone, Debug)]
pub struct LinkSender {
    /// What the platform knows it as: on macOS, its bundle identifier.
    pub app_id: String,
    /// Its name, as people see it.
    pub app_name: String,
}

impl State {
    /// Opens `urls`, which `sender` sent if it is known, in Mini Wren, now
    /// or once the app can.
    pub fn open_urls(self: &Rc<Self>, mt: MainThread, urls: &[String], sender: Option<LinkSender>) {
        let urls = urls.iter().map(|url| (url.clone(), sender.clone()));
        self.held_links.borrow_mut().extend(urls);
        self.open_held(mt);
    }

    /// Opens each link held in a Mini Wren, from the space of the window the
    /// user browses in, or the space used last, or that window's profile if
    /// it shows one with no space.
    pub(super) fn open_held_links(self: &Rc<Self>, mt: MainThread) {
        if self.held_links.borrow().is_empty() {
            return;
        }
        let place = self.browsing_window().and_then(|window| window.place());
        let place = match place {
            Some(place) => place,
            None => match self.db.most_recent_space() {
                Ok(Some(space)) => Place::Space(space.id),
                Ok(None) => return eprintln!("Wren found no space to open links in."),
                Err(error) => return eprintln!("Wren could not read the spaces: {error}"),
            },
        };
        // Each comes in front of the last, so the first link is in front.
        for (url, sender) in self.held_links.take().into_iter().rev() {
            self.open_link_popup(mt, url, sender, place.clone());
        }
    }

    // Opens `url` in a Mini Wren of its own on `place`'s profile, with no
    // opener, from `place` if it is a space, cascaded from the window in
    // front. It remembers `sender`, to go back to as it closes.
    fn open_link_popup(
        self: &Rc<Self>,
        mt: MainThread,
        url: String,
        sender: Option<LinkSender>,
        place: Place,
    ) {
        let state = self.clone();
        let space = place.space();
        self.open_profile_of(mt, place, move |profile| {
            let profile = match profile {
                Ok(profile) => profile,
                Err(error) => return eprintln!("Wren could not open a link: {error}"),
            };
            // A link asks for no size, so it gets a popup's own.
            let size = RequestedBounds {
                origin: None,
                width: PAGE_SIZE.0,
                height: PAGE_SIZE.1,
            };
            profile.create_popup_browser(&url, Some(size), move |browser| match browser {
                Ok(browser) => {
                    let window = state.show_popup(mt, browser, space, None);
                    if let Some((window, sender)) = window.zip(sender) {
                        state.returns_to.borrow_mut().insert(window, sender);
                    }
                }
                Err(error) => eprintln!("Wren could not open a link: {error:?}"),
            });
        });
    }

    /// Window `id` came into use: no Mini Wren but it goes back to its
    /// link's sender as it closes.
    pub(super) fn window_used(&self, id: WindowId) {
        self.returns_to
            .borrow_mut()
            .retain(|window, _| *window == id);
    }

    /// Popup window `id`'s page moved to a tab, where it goes on: its window
    /// closes without going back to its link's sender.
    pub(super) fn popup_moved_to_tab(&self, id: WindowId) {
        self.returns_to.borrow_mut().remove(&id);
    }

    /// Popup `window` is closing: if a link opened it, and it is still the
    /// window in use, the app that sent the link comes back to the front.
    pub fn link_popup_closed(&self, window: &BrowserWindow) {
        let sender = self.returns_to.borrow_mut().remove(&window.id);
        if let Some(sender) = sender.filter(|_| window.page.is_active())
            && !platform::activate_app(&sender.app_id)
        {
            eprintln!("Wren could not go back to {}.", sender.app_name);
        }
    }
}
