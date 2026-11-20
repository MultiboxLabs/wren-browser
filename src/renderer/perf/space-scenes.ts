// The scenes of the run that checks the sidebar's drags (drags.tsx) that
// take items to another space, of the same profile or of another.
// drag-scenes.ts has the rest, and these come after them.

import { browser, perf, pins } from "@/ipc";
import {
  askedFirst,
  chosen,
  dragged,
  draggedThroughButton,
  grouped,
  isDrawnOpen,
  isOpenIn,
  isUnopened,
  keepsTabs,
  movedToPins,
  opened,
  refused,
  sameGroup,
  sameLook,
  type Scene,
  secondSpace,
  shownSpace,
  shows,
  spaceOfAnotherProfile,
  switchesTo
} from "./drag-steps";
import {
  after,
  closeOmnibox,
  favorites,
  folder,
  group,
  half,
  heading,
  onto,
  pin,
  spaceButton,
  spaces,
  tab
} from "./dragging";

/** The scenes between spaces, for a run whose pages are at `url`. */
export const spaceScenes = (url: string): Scene[] => [
  {
    name: "Another space",
    tabs: 4,
    steps: [
      { name: "a second space made", does: secondSpace, shows: "tabs 0 1 2 3 / nothing" },
      {
        name: "a tab onto another space's button",
        does: dragged(tab(0), spaceButton(1)),
        shows: "tabs 1 2 3 / tabs 0"
      },
      { name: "two tabs put in a group", does: grouped(2, 3), shows: "tabs 1 {2 3} / tabs 0" },
      sameGroup(2, {
        name: "a group onto another space's button",
        does: dragged(group(2), spaceButton(1)),
        shows: "tabs 1 / tabs {2 3} 0"
      }),
      {
        name: "a tab held over another space's button, then to a place in that space's list",
        does: () => draggedThroughButton(tab(1), 1, after(tab(0))),
        shows: "nothing / tabs {2 3} 0 1"
      },
      {
        name: "a tab onto that space's heading",
        does: dragged(tab(0), heading),
        shows: "nothing / pins 0 | tabs {2 3} 1"
      },
      keepsTabs(pin(0), 0, {
        name: "an open pinned tab onto another space's button, which takes it to the top of that space's pins with its tab",
        does: dragged(pin(0), spaceButton(0)),
        shows: "pins 0 / tabs {2 3} 1"
      }),
      {
        name: "the pinned tab held over the second space's button as the page loses focus, then to a place in that space's list, which unpins it there",
        does: async () => {
          await shownSpace(0)();
          await draggedThroughButton(pin(0), 1, after(tab(1)), { focusLost: true });
        },
        shows: "nothing / tabs {2 3} 1 0"
      },
      {
        name: "the tab onto that space's heading again",
        does: dragged(tab(0), heading),
        shows: "nothing / pins 0 | tabs {2 3} 1"
      },
      {
        name: "Add to Favourites, which both spaces show",
        does: chosen(tab(1), "Add to Favourites"),
        shows: "favs 1 / favs 1 | pins 0 | tabs {2 3}"
      },
      keepsTabs(pin(1), 0, {
        name: "an open favourite moved to the other space's pins, which keeps its tab, moved to that space",
        does: movedToPins(pin(1), 0),
        shows: "pins 1 / pins 0 | tabs {2 3}"
      }),
      {
        name: "a pinned tab's Close Tab",
        does: chosen(pin(0), "Close Tab"),
        shows: "pins 1 / pins 0 | tabs {2 3}"
      },
      {
        name: "an unopened pinned tab moved to the other space's pins",
        does: movedToPins(pin(0), 0),
        shows: "pins 1 0 / tabs {2 3}"
      },
      {
        name: "Reopen Closed Tab, which brings the pin's tab back as a tab of the list, as its pin is another space's now",
        does: perf.reopenClosedTab,
        shows: "pins 1 0 / tabs 0 {2 3}"
      },
      // A favourite has one tab in a window, which moves to the space that
      // opens it.
      {
        name: "Add to Favourites in the second space",
        does: async () => {
          await shownSpace(1)();
          await chosen(tab(2), "Add to Favourites")();
          await isOpenIn(pin(2), 1)();
        },
        shows: "favs 2 | pins 1 0 / favs 2 | tabs 0 {3}"
      },
      keepsTabs(pin(2), 0, {
        name: "the favourite pressed in the first space, which moves its tab there",
        does: async () => {
          await shownSpace(0)();
          await opened(pin(2))();
        },
        shows: "favs 2 | pins 1 0 / favs 2 | tabs 0 {3}"
      }),
      {
        name: "Close Tab from the favourite's menu in the second space, which closes its tab in the first",
        does: async () => {
          await shownSpace(1)();
          await chosen(pin(2), "Close Tab")();
          await isUnopened(pin(2))();
        },
        shows: "favs 2 | pins 1 0 / favs 2 | tabs 0 {3}"
      },
      {
        name: "a split of two new tabs made a favourite in the second space",
        does: async () => {
          await browser.open(`${url}/tab/7`);
          await browser.open(`${url}/tab/8`);
          closeOmnibox();
          await shows("favs 2 | pins 1 0 / favs 2 | tabs 8 7 0 {3}");
          await dragged(tab(8), half(tab(7), "right"))();
          await shows("favs 2 | pins 1 0 / favs 2 | tabs (7|8) 0 {3}");
          await chosen(tab(7), "Add to Favourites")();
        },
        shows: "favs 2 (7|8) | pins 1 0 / favs 2 (7|8) | tabs 0 {3}"
      },
      keepsTabs(pin(7), 0, {
        name: "the split favourite pressed in the first space, which moves its two there as a split",
        does: async () => {
          await shownSpace(0)();
          await opened(pin(7))();
        },
        shows: "favs 2 (7|8) | pins 1 0 / favs 2 (7|8) | tabs 0 {3}"
      }),
      keepsTabs(pin(7), 1, {
        name: "the split favourite pressed in the second space, which leaves the first with no tab of its own",
        does: async () => {
          await shownSpace(1)();
          await opened(pin(7))();
        },
        shows: "favs 2 (7|8) | pins 1 0 / favs 2 (7|8) | tabs 0 {3}"
      }),
      {
        name: "the favourite's tab closed in the second space and opened in the first, then Reopen Closed Tab in the second, which brings it back as a tab of the list",
        does: async () => {
          await opened(pin(2))();
          await isOpenIn(pin(2), 1)();
          await chosen(pin(2), "Close Tab")();
          await isUnopened(pin(2))();
          await shownSpace(0)();
          await opened(pin(2))();
          await isOpenIn(pin(2), 0)();
          await shownSpace(1)();
          await perf.reopenClosedTab();
        },
        shows: "favs 2 (7|8) | pins 1 0 / favs 2 (7|8) | tabs 2 0 {3}"
      },
      keepsTabs(pin(2), 1, {
        name: "the favourite open in the first space moved to the second space's pins, which keeps its tab",
        does: movedToPins(pin(2), 1),
        shows: "favs (7|8) | pins 1 0 / favs (7|8) | pins 2 | tabs 2 0 {3}"
      }),
      {
        name: "the split favourite, open in the second space, drawn open in both",
        does: isDrawnOpen(pin(7)),
        shows: "favs (7|8) | pins 1 0 / favs (7|8) | pins 2 | tabs 2 0 {3}"
      },
      {
        name: "a pinned tab of the first space held over the second space's button, then onto half of a tab, which makes a split with it in that space's list",
        does: async () => {
          await shownSpace(0)();
          await draggedThroughButton(pin(1), 1, half(tab(0), "left"));
        },
        shows: "favs (7|8) | pins 0 / favs (7|8) | pins 2 | tabs 2 (1|0) {3}"
      }
    ]
  },
  {
    // On the second space the scene before made.
    name: "A folder to another space",
    tabs: 4,
    steps: [
      {
        name: "a tab onto the second space's button",
        does: dragged(tab(3), spaceButton(1)),
        shows: "tabs 0 1 2 / tabs 3"
      },
      { name: "a tab onto the space's heading", does: dragged(tab(0), heading), shows: "pins 0 | tabs 1 2 / tabs 3" },
      { name: "another onto the space's heading", does: dragged(tab(1), heading), shows: "pins 1 0 | tabs 2 / tabs 3" },
      {
        name: "a folder made",
        does: () => pins.newFolder(spaces[0], null, null),
        shows: "pins 1 0 [] | tabs 2 / tabs 3"
      },
      {
        name: "a pinned tab onto the folder",
        does: dragged(pin(0), onto(folder)),
        shows: "pins 1 [0] | tabs 2 / tabs 3"
      },
      keepsTabs(pin(0), 1, {
        name: "the folder onto the second space's button, which takes all in it, and the open pin's tab, to the top of that space's pins",
        does: dragged(folder, spaceButton(1)),
        shows: "pins 1 | tabs 2 / pins [0] | tabs 3"
      }),
      keepsTabs(pin(0), 0, {
        name: "the folder held over the first space's button, then to a place among that space's pins",
        does: async () => {
          await shownSpace(1)();
          await draggedThroughButton(folder, 0, after(pin(1)));
        },
        shows: "pins 1 [0] | tabs 2 / tabs 3"
      })
    ]
  },
  {
    // Tabs of the list go to a space of another profile as new tabs on their
    // pages, in a split and a group like those they left, once the user says
    // they may, and the window goes to that space.
    name: "Another profile",
    tabs: 6,
    steps: [
      {
        name: "a space of another profile made",
        does: spaceOfAnotherProfile,
        shows: "tabs 0 1 2 3 4 5 / nothing / nothing"
      },
      askedFirst("Cancel", {
        name: "a tab onto the other profile's space's button, then Cancel, which leaves it",
        does: dragged(tab(0), spaceButton(2)),
        shows: "tabs 0 1 2 3 4 5 / nothing / nothing"
      }),
      switchesTo(
        2,
        askedFirst("Move", {
          name: "a tab onto the other profile's space's button, then Move, which makes it again there and shows that space",
          does: dragged(tab(0), spaceButton(2)),
          shows: "tabs 1 2 3 4 5 / nothing / tabs 0"
        })
      ),
      { name: "the first space shown again", does: shownSpace(0), shows: "tabs 1 2 3 4 5 / nothing / tabs 0" },
      {
        name: "a tab onto a tab",
        does: dragged(tab(1), half(tab(2), "right")),
        shows: "tabs (2|1) 3 4 5 / nothing / tabs 0"
      },
      switchesTo(
        2,
        askedFirst("Move", {
          name: "a split onto the other profile's space's button, which makes it again as a split",
          does: dragged(tab(2), spaceButton(2)),
          shows: "tabs 3 4 5 / nothing / tabs (2|1) 0"
        })
      ),
      { name: "the first space shown again", does: shownSpace(0), shows: "tabs 3 4 5 / nothing / tabs (2|1) 0" },
      { name: "two tabs put in a group", does: grouped(3, 4), shows: "tabs {3 4} 5 / nothing / tabs (2|1) 0" },
      sameLook(
        3,
        switchesTo(
          2,
          askedFirst("Move", {
            name: "a group onto the other profile's space's button, which makes it again with its name and colour",
            does: dragged(group(3), spaceButton(2)),
            shows: "tabs 5 / nothing / tabs {3 4} (2|1) 0"
          })
        )
      ),
      { name: "the first space shown again", does: shownSpace(0), shows: "tabs 5 / nothing / tabs {3 4} (2|1) 0" },
      askedFirst("Move", {
        name: "a tab held over the other profile's space's button, then to a place in that space's list",
        does: () => draggedThroughButton(tab(5), 2, after(tab(0))),
        shows: "nothing / nothing / tabs {3 4} (2|1) 0 5"
      }),
      switchesTo(
        0,
        askedFirst("Move", {
          name: "a tab onto the first space's button, which makes it again in the first profile and shows that space",
          does: dragged(tab(5), spaceButton(0)),
          shows: "tabs 5 / nothing / tabs {3 4} (2|1) 0"
        })
      ),
      {
        name: "a tab onto the space's heading",
        does: dragged(tab(5), heading),
        shows: "pins 5 / nothing / tabs {3 4} (2|1) 0"
      },
      // A pin goes to another profile unopened, as no tab can go there, and
      // without asking.
      switchesTo(2, {
        name: "an open pinned tab onto the other profile's space's button, which takes it to that space's pins unopened and shows that space",
        does: async () => {
          await dragged(pin(5), spaceButton(2))();
          await isUnopened(pin(5))();
        },
        shows: "nothing / nothing / pins 5 | tabs {3 4} (2|1) 0"
      }),
      {
        name: "the pinned tab held over the first space's button, then onto that space's heading",
        does: () => draggedThroughButton(pin(5), 0, heading),
        shows: "pins 5 / nothing / tabs {3 4} (2|1) 0"
      },
      {
        name: "the pinned tab held over the other profile's space's button, then onto half of a tab, which makes a split with it in that space's list",
        does: () => draggedThroughButton(pin(5), 2, half(tab(0), "right")),
        shows: "nothing / nothing / tabs {3 4} (2|1) (0|5)"
      },
      {
        name: "the split onto the space's heading",
        does: dragged(tab(0), heading),
        shows: "nothing / nothing / pins (0|5) | tabs {3 4} (2|1)"
      },
      {
        name: "the split pin held over the first space's button, then onto the favourites",
        does: () => draggedThroughButton(pin(0), 0, favorites),
        shows: "favs (0|5) / favs (0|5) / tabs {3 4} (2|1)"
      },
      {
        name: "the favourite onto the other profile's space's button, which takes none",
        does: refused(pin(0), spaceButton(2)),
        shows: "favs (0|5) / favs (0|5) / tabs {3 4} (2|1)"
      },
      {
        name: "Pin to Space",
        does: chosen(pin(0), "Pin to Space"),
        shows: "pins (0|5) / nothing / tabs {3 4} (2|1)"
      },
      {
        name: "the split pin held over the other profile's space's button, then to a place in its list, which unpins it there",
        does: () => draggedThroughButton(pin(0), 2, after(tab(2))),
        shows: "nothing / nothing / tabs {3 4} (2|1) (0|5)"
      },
      {
        name: "a folder made, and the split put in it, which pins it",
        does: async () => {
          await pins.newFolder(spaces[2], null, null);
          await shows("nothing / nothing / pins [] | tabs {3 4} (2|1) (0|5)");
          await dragged(tab(0), onto(folder))();
        },
        shows: "nothing / nothing / pins [(0|5)] | tabs {3 4} (2|1)"
      },
      switchesTo(0, {
        name: "the folder onto the first space's button, which takes all in it there, the open split pin unopened",
        does: async () => {
          await dragged(folder, spaceButton(0))();
          await isUnopened(pin(0))();
        },
        shows: "pins [(0|5)] / nothing / tabs {3 4} (2|1)"
      })
    ]
  }
];
