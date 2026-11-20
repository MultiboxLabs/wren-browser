// The scenes of the run that checks the sidebar's drags (drags.tsx), each a
// list of steps (drag-steps.ts) that follow one another from a sidebar of
// new tabs. Add a step here when what a drag or a menu does changes.

import { browser, groups, items, perf, pins } from "@/ipc";
import {
  askedFirst,
  chosen,
  chosenOfMarked,
  deleted,
  dragged,
  draggedThroughButton,
  folded,
  folderFoldedWithPeek,
  grouped,
  isDrawnOpen,
  isOpenIn,
  isUnopened,
  keepsTabs,
  linked,
  makesFolder,
  menuComes,
  markedMenuHolds,
  marks,
  menuHolds,
  moveRefused,
  movedToPins,
  opened,
  pressed,
  refsOf,
  refused,
  sameGroup,
  sameLook,
  type Scene,
  secondSpace,
  selected,
  selects,
  shownSpace,
  shows,
  spaceOfAnotherProfile,
  splitWith,
  stays,
  switchesTo
} from "./drag-steps";
import {
  after,
  before,
  closeOmnibox,
  drag,
  favorites,
  folder,
  group,
  groupId,
  half,
  heading,
  onto,
  peek,
  pin,
  press,
  pressEscape,
  pressNewTab,
  spaceButton,
  spaces,
  tab,
  tabId,
  tileEdge
} from "./dragging";

/** The scenes, for a run whose pages are at `url`. */
export const scenes = (url: string): Scene[] => [
  {
    name: "The list",
    tabs: 6,
    steps: [
      { name: "a tab to a place further down", does: dragged(tab(0), after(tab(2))), shows: "tabs 1 2 0 3 4 5" },
      { name: "a tab to a place further up", does: dragged(tab(5), before(tab(1))), shows: "tabs 5 1 2 0 3 4" },
      {
        name: "a tab onto the right half of a tab",
        does: dragged(tab(3), half(tab(4), "right")),
        shows: "tabs 5 1 2 0 (4|3)"
      },
      {
        name: "a tab onto the left half of a tab",
        does: dragged(tab(5), half(tab(1), "left")),
        shows: "tabs (5|1) 2 0 (4|3)"
      },
      { name: "two tabs put in a group", does: grouped(2, 0), shows: "tabs (5|1) {2 0} (4|3)" },
      sameGroup(2, {
        name: "a group to a place further down",
        does: dragged(group(2), after(tab(4))),
        shows: "tabs (5|1) (4|3) {2 0}"
      }),
      sameGroup(2, {
        name: "a group to a place further up",
        does: dragged(group(2), before(tab(5))),
        shows: "tabs {2 0} (5|1) (4|3)"
      })
    ]
  },
  {
    name: "A group",
    tabs: 6,
    steps: [
      { name: "three tabs put in a group", does: grouped(1, 2, 3), shows: "tabs 0 {1 2 3} 4 5" },
      { name: "a tab onto a tab", does: dragged(tab(4), half(tab(5), "right")), shows: "tabs 0 {1 2 3} (5|4)" },
      sameGroup(1, {
        name: "a split into a group, between two of its tabs",
        does: dragged(tab(5), after(tab(1), 1)),
        shows: "tabs 0 {1 (5|4) 2 3}"
      }),
      {
        name: "a split to the last place of its group",
        does: dragged(tab(5), after(tab(3), 1)),
        shows: "tabs 0 {1 2 3 (5|4)}"
      },
      sameGroup(1, {
        name: "a split out of the end of its group, held further out",
        does: dragged(tab(5), after(tab(5), 0)),
        shows: "tabs 0 {1 2 3} (5|4)"
      }),
      {
        name: "a split into the end of a group, held further in",
        does: dragged(tab(5), after(tab(3), 1)),
        shows: "tabs 0 {1 2 3 (5|4)}"
      },
      sameGroup(1, {
        name: "a split out of its group, above it",
        does: dragged(tab(5), before(group(1))),
        shows: "tabs 0 (5|4) {1 2 3}"
      }),
      sameGroup(1, {
        name: "a tab out of the end of its group, held further out",
        does: dragged(tab(3), after(tab(3), 0)),
        shows: "tabs 0 (5|4) {1 2} 3"
      }),
      sameGroup(1, {
        name: "a tab into a group, under its heading",
        does: dragged(tab(0), after(group(1))),
        shows: "tabs (5|4) {0 1 2} 3"
      })
    ]
  },
  {
    name: "The pins",
    tabs: 6,
    steps: [
      { name: "a tab onto the space's heading", does: dragged(tab(0), heading), shows: "pins 0 | tabs 1 2 3 4 5" },
      {
        name: "a tab to a place among the pins",
        does: dragged(tab(1), after(pin(0))),
        shows: "pins 0 1 | tabs 2 3 4 5"
      },
      {
        name: "a pinned tab to another place among the pins",
        does: dragged(pin(1), before(pin(0))),
        shows: "pins 1 0 | tabs 2 3 4 5"
      },
      {
        name: "a tab onto a tab",
        does: dragged(tab(2), half(tab(3), "right")),
        shows: "pins 1 0 | tabs (3|2) 4 5"
      },
      { name: "a split onto the space's heading", does: dragged(tab(3), heading), shows: "pins (3|2) 1 0 | tabs 4 5" },
      {
        name: "a pinned tab to a place in the list",
        does: dragged(pin(0), after(tab(4))),
        shows: "pins (3|2) 1 | tabs 4 0 5"
      },
      {
        name: "a pinned split to a place in the list",
        does: dragged(pin(3), before(tab(4))),
        shows: "pins 1 | tabs (3|2) 4 0 5"
      },
      {
        name: "a pinned tab onto the left half of a tab, which it takes as its split's other side",
        does: dragged(pin(1), half(tab(4), "left")),
        shows: "pins (1|4) | tabs (3|2) 0 5"
      },
      {
        name: "a pinned split onto a tab, which the app refuses",
        does: moveRefused(pin(1), splitWith(0, "right")),
        shows: "pins (1|4) | tabs (3|2) 0 5"
      },
      { name: "a tab onto the space's heading", does: dragged(tab(0), heading), shows: "pins 0 (1|4) | tabs (3|2) 5" },
      {
        name: "a pinned tab onto a split of the list, which the app refuses",
        does: moveRefused(pin(0), splitWith(3, "left")),
        shows: "pins 0 (1|4) | tabs (3|2) 5"
      }
    ]
  },
  {
    name: "A folder",
    tabs: 6,
    steps: [
      { name: "a tab onto the space's heading", does: dragged(tab(0), heading), shows: "pins 0 | tabs 1 2 3 4 5" },
      { name: "another onto the space's heading", does: dragged(tab(1), heading), shows: "pins 1 0 | tabs 2 3 4 5" },
      {
        name: "a folder made",
        does: () => pins.newFolder(spaces[0], null, null),
        shows: "pins 1 0 [] | tabs 2 3 4 5"
      },
      { name: "a pinned tab onto a folder", does: dragged(pin(0), onto(folder)), shows: "pins 1 [0] | tabs 2 3 4 5" },
      {
        name: "a pinned tab into the end of a folder, held further in",
        does: dragged(pin(1), after(pin(0), 1)),
        shows: "pins [0 1] | tabs 2 3 4 5"
      },
      {
        name: "a pinned tab out of the end of its folder, held further out",
        does: dragged(pin(1), after(pin(1), 0)),
        shows: "pins [0] 1 | tabs 2 3 4 5"
      },
      {
        name: "a pinned tab to before a folder",
        does: dragged(pin(1), before(folder)),
        shows: "pins 1 [0] | tabs 2 3 4 5"
      },
      {
        name: "a tab of the list onto a folder",
        does: dragged(tab(2), onto(folder)),
        shows: "pins 1 [2 0] | tabs 3 4 5"
      },
      {
        name: "a folder to another place among the pins",
        does: dragged(folder, before(pin(1))),
        shows: "pins [2 0] 1 | tabs 3 4 5"
      },
      {
        name: "a folder onto the favourites, which take none",
        does: refused(folder, favorites),
        shows: "pins [2 0] 1 | tabs 3 4 5"
      },
      { name: "two tabs put in a group", does: grouped(3, 4), shows: "pins [2 0] 1 | tabs {3 4} 5" },
      {
        name: "a group onto the favourites, which take none",
        does: refused(group(3), favorites),
        shows: "pins [2 0] 1 | tabs {3 4} 5"
      },
      makesFolder("Group 1", true, {
        name: "a group to a place among the pins, which keep it as a folder of its name",
        does: dragged(group(3), after(pin(1))),
        shows: "pins [2 0] 1 [3 4] | tabs 5"
      })
    ]
  },
  {
    name: "A folder's peek",
    tabs: 3,
    steps: [
      { name: "a tab onto the space's heading", does: dragged(tab(0), heading), shows: "pins 0 | tabs 1 2" },
      {
        name: "a folder made",
        does: () => pins.newFolder(spaces[0], null, null),
        shows: "pins 0 [] | tabs 1 2"
      },
      { name: "the pinned tab onto the folder", does: dragged(pin(0), onto(folder)), shows: "pins [0] | tabs 1 2" },
      { name: "the pinned tab opened", does: opened(pin(0)), shows: "pins [0] | tabs 1 2" },
      {
        name: "the folder folded, which shows the pinned tab as its peek",
        does: folderFoldedWithPeek(0),
        shows: "pins [0] | tabs 1 2"
      },
      {
        name: "the peek let go on itself, which leaves it in its folder",
        does: stays(peek(0), onto(peek(0))),
        shows: "pins [0] | tabs 1 2"
      },
      {
        name: "the peek onto the space's heading, which takes it out of its folder",
        does: dragged(peek(0), heading),
        shows: "pins 0 [] | tabs 1 2"
      }
    ]
  },
  {
    name: "A group kept",
    tabs: 6,
    steps: [
      { name: "a tab onto a tab", does: dragged(tab(1), half(tab(2), "right")), shows: "tabs 0 (2|1) 3 4 5" },
      { name: "a split and a tab put in a group", does: grouped(2, 1, 3), shows: "tabs 0 {(2|1) 3} 4 5" },
      { name: "the group folded", does: folded(2), shows: "tabs 0 {(2|1) 3} 4 5" },
      makesFolder("Group 1", false, {
        name: "a folded group onto the space's heading, which makes a folded folder, its split a pinned split",
        does: dragged(group(2), heading),
        shows: "pins [(2|1) 3] | tabs 0 4 5"
      }),
      {
        name: "two tabs put in a group, which is given a name",
        does: async () => {
          await grouped(0, 4)();
          await shows("pins [(2|1) 3] | tabs {0 4} 5");
          await groups.rename((await groupId(0)) ?? "", "Reading");
        },
        shows: "pins [(2|1) 3] | tabs {0 4} 5"
      },
      makesFolder("Reading", true, {
        name: "a group onto a folder, which takes it as a folder in it",
        does: dragged(group(0), onto(folder)),
        shows: "pins [(2|1) 3 [0 4]] | tabs 5"
      })
    ]
  },
  {
    name: "The favourites",
    tabs: 6,
    steps: [
      { name: "a tab onto the favourites", does: dragged(tab(0), favorites), shows: "favs 0 | tabs 1 2 3 4 5" },
      {
        name: "a tab to after a favourite",
        does: dragged(tab(1), tileEdge(pin(0), "right")),
        shows: "favs 0 1 | tabs 2 3 4 5"
      },
      {
        name: "a favourite to before another",
        does: dragged(pin(1), tileEdge(pin(0), "left")),
        shows: "favs 1 0 | tabs 2 3 4 5"
      },
      {
        name: "a favourite onto the space's heading",
        does: dragged(pin(0), heading),
        shows: "favs 1 | pins 0 | tabs 2 3 4 5"
      },
      {
        name: "a pinned tab to after a favourite",
        does: dragged(pin(0), tileEdge(pin(1), "right")),
        shows: "favs 1 0 | tabs 2 3 4 5"
      },
      {
        name: "a favourite to a place in the list",
        does: dragged(pin(1), after(tab(2))),
        shows: "favs 0 | tabs 2 1 3 4 5"
      },
      {
        name: "a favourite onto the right half of a tab, which it takes as its split's other side",
        does: dragged(pin(0), half(tab(3), "right")),
        shows: "favs (3|0) | tabs 2 1 4 5"
      }
    ]
  },
  {
    name: "The menu",
    tabs: 6,
    steps: [
      {
        name: "a tab's menu",
        does: menuHolds(
          tab(1),
          "Reload, Duplicate, Copy Link, Mute Tab | Add Tab to New Group, Open in Split View | Close Tab, Close Other Tabs, Close Tabs Below | Pin Tab, Add to Favourites"
        ),
        shows: "tabs 0 1 2 3 4 5"
      },
      { name: "Pin Tab", does: chosen(tab(1), "Pin Tab"), shows: "pins 1 | tabs 0 2 3 4 5" },
      { name: "Pin Tab, above the pins there are", does: chosen(tab(2), "Pin Tab"), shows: "pins 2 1 | tabs 0 3 4 5" },
      {
        name: "an open pinned tab's menu",
        does: menuHolds(
          pin(2),
          "Reload, Copy Link, Mute Tab | Rename…, New Folder | Close Tab | Move to Favourites, Unpin"
        ),
        shows: "pins 2 1 | tabs 0 3 4 5"
      },
      {
        name: "Move to Favourites",
        does: chosen(pin(1), "Move to Favourites"),
        shows: "favs 1 | pins 2 | tabs 0 3 4 5"
      },
      {
        name: "Add to Favourites",
        does: chosen(tab(0), "Add to Favourites"),
        shows: "favs 1 0 | pins 2 | tabs 3 4 5"
      },
      { name: "Pin to Space", does: chosen(pin(0), "Pin to Space"), shows: "favs 1 | pins 0 2 | tabs 3 4 5" },
      { name: "Unpin", does: chosen(pin(0), "Unpin"), shows: "favs 1 | pins 2 | tabs 3 4 5" },
      {
        name: "Remove from Favourites",
        does: chosen(pin(1), "Remove from Favourites"),
        shows: "pins 2 | tabs 3 4 5"
      },
      { name: "a pinned tab's Close Tab", does: chosen(pin(2), "Close Tab"), shows: "pins 2 | tabs 3 4 5" },
      {
        name: "an unopened pinned tab's menu",
        does: menuHolds(pin(2), "Open | Copy Link | Rename…, New Folder | Move to Favourites, Unpin"),
        shows: "pins 2 | tabs 3 4 5"
      },
      { name: "a tab onto a tab", does: dragged(tab(4), half(tab(5), "right")), shows: "pins 2 | tabs 3 (5|4)" },
      {
        name: "a split's Add Tab to New Group, which keeps the split",
        does: chosen(tab(4), "Add Tab to New Group"),
        shows: "pins 2 | tabs 3 {(5|4)}"
      },
      {
        name: "a split's Remove from Group, which keeps the split",
        does: chosen(tab(5), "Remove from Group"),
        shows: "pins 2 | tabs 3 (5|4)"
      },
      {
        name: "a split's Close Other Tabs, which keeps its other side",
        does: chosen(tab(4), "Close Other Tabs"),
        shows: "pins 2 | tabs (5|4)"
      },
      {
        name: "a group's menu",
        does: async () => {
          await chosen(tab(4), "Add Tab to New Group")();
          await shows("pins 2 | tabs {(5|4)}");
          await menuHolds(group(4), "New Tab in Group, Rename Group…, Colour > | Ungroup, Close Group")();
        },
        shows: "pins 2 | tabs {(5|4)}"
      },
      { name: "Ungroup", does: chosen(group(4), "Ungroup"), shows: "pins 2 | tabs (5|4)" },
      { name: "a split onto the space's heading", does: dragged(tab(5), heading), shows: "pins (5|4) 2" },
      {
        name: "an open pinned split's menu",
        does: menuHolds(
          pin(5),
          "Reload, Copy Link, Mute Tab | Swap Sides, Show Stacked | Rename…, New Folder | Close Tab | Move to Favourites, Unpin"
        ),
        shows: "pins (5|4) 2"
      },
      { name: "a pinned split's Swap Sides", does: chosen(pin(5), "Swap Sides"), shows: "pins (4|5) 2" },
      { name: "a pinned tab's New Folder", does: chosen(pin(2), "New Folder"), shows: "pins (4|5) 2 []" },
      {
        name: "a folder's menu",
        does: menuHolds(folder, "Rename…, New Folder | Delete Folder…"),
        shows: "pins (4|5) 2 []"
      }
    ]
  },
  {
    name: "The selection",
    tabs: 4,
    steps: [
      { name: "a tab selected, whose row alone is drawn selected", does: selected(2), shows: "tabs 0 1 2 3" },
      { name: "another selected", does: selected(0), shows: "tabs 0 1 2 3" },
      {
        name: "the omnibox for a new tab opened, which leaves no tab drawn selected",
        does: async () => {
          pressNewTab();
          await selects()();
        },
        shows: "tabs 0 1 2 3"
      },
      {
        name: "the omnibox closed, which draws the tab selected again",
        does: async () => {
          closeOmnibox();
          await selects(tab(0))();
        },
        shows: "tabs 0 1 2 3"
      },
      {
        name: "the selected tab pinned, whose pin's row is drawn selected",
        does: async () => {
          await drag(tab(0), heading);
          await shows("pins 0 | tabs 1 2 3");
          await selects(pin(0))();
        },
        shows: "pins 0 | tabs 1 2 3"
      },
      {
        name: "a tab of the list selected, which leaves the pin's row",
        does: selected(3),
        shows: "pins 0 | tabs 1 2 3"
      }
    ]
  },
  {
    name: "Several tabs",
    tabs: 8,
    steps: [
      { name: "a tab selected", does: selected(5), shows: "tabs 0 1 2 3 4 5 6 7" },
      {
        name: "a press with Command held, which marks the row and selects nothing",
        does: async () => {
          await pressed(tab(1), { command: true }, tab(1))();
          await selects(tab(5))();
        },
        shows: "tabs 0 1 2 3 4 5 6 7"
      },
      {
        name: "another row marked",
        does: pressed(tab(3), { command: true }, tab(1), tab(3)),
        shows: "tabs 0 1 2 3 4 5 6 7"
      },
      {
        name: "a marked row to the end of the list, which takes the marked rows and the selected tab's",
        does: dragged(tab(1), after(tab(7))),
        shows: "tabs 0 2 4 6 7 1 3 5"
      },
      {
        name: "a marked row to a place further up, with the others, which stay marked",
        does: async () => {
          await drag(tab(3), after(tab(0)));
          await shows("tabs 0 1 3 5 2 4 6 7");
          await marks(tab(1), tab(3))();
        },
        shows: "tabs 0 1 3 5 2 4 6 7"
      },
      {
        name: "a press on a row that is not marked, which selects it and leaves none marked",
        does: async () => {
          await pressed(tab(6), {})();
          await selects(tab(6))();
        },
        shows: "tabs 0 1 3 5 2 4 6 7"
      },
      {
        name: "a press with Shift held, which marks the rows from the selected tab's to it",
        does: pressed(tab(5), { shift: true }, tab(5), tab(2), tab(4)),
        shows: "tabs 0 1 3 5 2 4 6 7"
      },
      {
        name: "the menu of marked rows",
        does: markedMenuHolds(
          [tab(5), tab(2), tab(4), tab(6)],
          "Add Tabs to New Group | Close Tabs | Pin Tabs, Add to Favourites"
        ),
        shows: "tabs 0 1 3 5 2 4 6 7"
      },
      {
        name: "Add Tabs to New Group",
        does: chosenOfMarked([tab(5), tab(2), tab(4), tab(6)], "Add Tabs to New Group"),
        shows: "tabs 0 1 3 {5 2 4 6} 7"
      },
      {
        name: "a tab closed that is not marked, which leaves the marks",
        does: async () => {
          await browser.close(await tabId(1));
          await shows("tabs 0 3 {5 2 4 6} 7");
          await marks(tab(5), tab(2), tab(4))();
        },
        shows: "tabs 0 3 {5 2 4 6} 7"
      },
      {
        name: "Escape, which leaves none marked",
        does: async () => {
          pressEscape();
          await marks()();
        },
        shows: "tabs 0 3 {5 2 4 6} 7"
      },
      {
        name: "two rows marked, and Close Tabs, which closes them and the selected tab",
        does: async () => {
          await pressed(tab(0), { command: true }, tab(0))();
          await pressed(tab(3), { command: true }, tab(0), tab(3))();
          await chosenOfMarked([tab(0), tab(3), tab(6)], "Close Tabs")();
        },
        shows: "tabs {5 2 4} 7"
      },
      {
        name: "Pin Tabs, which pins the marked rows in their order",
        does: async () => {
          await selected(4)();
          await pressed(tab(7), { command: true }, tab(7))();
          await chosenOfMarked([tab(4), tab(7)], "Pin Tabs")();
        },
        shows: "pins 4 7 | tabs {5 2}"
      },
      {
        name: "marked rows of a group onto the space's heading",
        does: async () => {
          await selected(5)();
          await pressed(tab(2), { command: true }, tab(2))();
          await drag(tab(2), heading);
        },
        shows: "pins 5 2 4 7"
      }
    ]
  },
  {
    name: "Several pinned tabs",
    tabs: 7,
    steps: [
      {
        name: "five marked tabs onto the space's heading",
        does: async () => {
          await selected(0)();
          for (const number of [1, 2, 3, 4]) await press(tab(number), { command: true });
          await drag(tab(0), heading);
        },
        shows: "pins 0 1 2 3 4 | tabs 5 6"
      },
      { name: "a tab of the list selected", does: selected(6), shows: "pins 0 1 2 3 4 | tabs 5 6" },
      {
        name: "a press with Command held on a pinned tab, which marks its row and selects nothing",
        does: async () => {
          await pressed(pin(1), { command: true }, pin(1))();
          await selects(tab(6))();
        },
        shows: "pins 0 1 2 3 4 | tabs 5 6"
      },
      {
        name: "another pinned tab marked",
        does: pressed(pin(3), { command: true }, pin(1), pin(3)),
        shows: "pins 0 1 2 3 4 | tabs 5 6"
      },
      {
        name: "a tab of the list marked, which leaves no pinned tab marked",
        does: pressed(tab(5), { command: true }, tab(5)),
        shows: "pins 0 1 2 3 4 | tabs 5 6"
      },
      {
        name: "a pinned tab marked, which leaves no tab of the list marked",
        does: async () => {
          await pressed(pin(1), { command: true }, pin(1))();
          await pressed(pin(3), { command: true }, pin(1), pin(3))();
        },
        shows: "pins 0 1 2 3 4 | tabs 5 6"
      },
      {
        name: "a marked pinned tab to the end of the pins, with the other",
        does: dragged(pin(1), after(pin(4))),
        shows: "pins 0 2 4 1 3 | tabs 5 6"
      },
      {
        name: "the menu of marked pinned tabs",
        does: markedMenuHolds([pin(1), pin(3)], "Add Tabs to New Folder | Close Tabs | Move to Favourites, Unpin"),
        shows: "pins 0 2 4 1 3 | tabs 5 6"
      },
      {
        name: "Add Tabs to New Folder, which makes it where the first of them was",
        does: chosenOfMarked([pin(1), pin(3)], "Add Tabs to New Folder"),
        shows: "pins 0 2 4 [1 3] | tabs 5 6"
      },
      {
        name: "a press on a pinned tab that is not marked, which selects it and leaves none marked",
        does: async () => {
          await pressed(pin(0), {})();
          await selects(pin(0))();
        },
        shows: "pins 0 2 4 [1 3] | tabs 5 6"
      },
      {
        name: "a press with Shift held, which marks the pinned tabs from the selected one to it",
        does: pressed(pin(4), { shift: true }, pin(2), pin(4)),
        shows: "pins 0 2 4 [1 3] | tabs 5 6"
      },
      {
        name: "their menu, which has the space's folders",
        does: markedMenuHolds(
          [pin(0), pin(2), pin(4)],
          "Add Tabs to New Folder, Add Tabs to Folder > | Close Tabs | Move to Favourites, Unpin"
        ),
        shows: "pins 0 2 4 [1 3] | tabs 5 6"
      },
      {
        name: "Add Tabs to Folder, which puts them last in it",
        does: chosenOfMarked([pin(0), pin(2), pin(4)], "New Folder"),
        shows: "pins [1 3 0 2 4] | tabs 5 6"
      },
      {
        name: "marked pinned tabs to a place in the list, which unpins them in their order",
        does: dragged(pin(2), after(tab(5))),
        shows: "pins [1 3] | tabs 5 0 2 4 6"
      },
      {
        name: "Move to Favourites",
        does: async () => {
          await pressed(pin(1), { command: true }, pin(1))();
          await pressed(pin(3), { command: true }, pin(1), pin(3))();
          await chosenOfMarked([pin(1), pin(3)], "Move to Favourites")();
        },
        shows: "favs 1 3 | pins [] | tabs 5 0 2 4 6"
      },
      {
        name: "two tabs marked and pinned, then Unpin, which removes them",
        does: async () => {
          await selected(5)();
          await pressed(tab(6), { command: true }, tab(6))();
          await chosenOfMarked([tab(5), tab(6)], "Pin Tabs")();
          await shows("favs 1 3 | pins 5 6 [] | tabs 0 2 4");
          await selected(0)();
          await pressed(pin(5), { command: true }, pin(5))();
          await pressed(pin(6), { command: true }, pin(5), pin(6))();
          await chosenOfMarked([pin(5), pin(6)], "Unpin")();
        },
        shows: "favs 1 3 | pins [] | tabs 0 2 4"
      },
      {
        name: "a tab of the list and a favourite asked to move together, which the app refuses",
        does: async () => {
          const mixed = await refsOf([tab(0), pin(1)]);
          const made = await items.move(mixed, { space: spaces[0], to: "tabs", group: null, index: 0 }).then(
            () => true,
            () => false
          );
          if (made) throw new Error("The app made the move.");
        },
        shows: "favs 1 3 | pins [] | tabs 0 2 4"
      }
    ]
  },
  {
    name: "A link",
    tabs: 3,
    steps: [
      { name: "a link to a place in the list", does: linked(url, 7, after(tab(0))), shows: "tabs 0 7 1 2" },
      { name: "a link onto the space's heading", does: linked(url, 8, heading), shows: "pins 8 | tabs 0 7 1 2" },
      {
        name: "a link to a place among the pins",
        does: linked(url, 9, after(pin(8))),
        shows: "pins 8 9 | tabs 0 7 1 2"
      },
      {
        name: "a link onto the favourites",
        does: linked(url, 6, favorites),
        shows: "favs 6 | pins 8 9 | tabs 0 7 1 2"
      }
    ]
  },
  {
    name: "A pin that goes",
    tabs: 5,
    steps: [
      { name: "a tab onto the space's heading", does: dragged(tab(0), heading), shows: "pins 0 | tabs 1 2 3 4" },
      {
        name: "a pinned tab's Close Tab, which leaves its pin unopened",
        does: async () => {
          await chosen(pin(0), "Close Tab")();
          await menuComes(pin(0), "Open | Copy Link | Rename…, New Folder | Move to Favourites, Unpin")();
        },
        shows: "pins 0 | tabs 1 2 3 4"
      },
      {
        name: "Reopen Closed Tab, which opens the pin again on the tab it had",
        does: async () => {
          await perf.reopenClosedTab();
          await menuComes(
            pin(0),
            "Reload, Copy Link, Mute Tab | Rename…, New Folder | Close Tab | Move to Favourites, Unpin"
          )();
        },
        shows: "pins 0 | tabs 1 2 3 4"
      },
      { name: "a tab onto a tab", does: dragged(tab(1), half(tab(2), "right")), shows: "pins 0 | tabs (2|1) 3 4" },
      {
        name: "a split onto the space's heading",
        does: dragged(tab(2), heading),
        shows: "pins (2|1) 0 | tabs 3 4"
      },
      {
        name: "an open pinned split deleted, which closes its tabs",
        does: deleted(pin(2)),
        shows: "pins 0 | tabs 3 4"
      },
      { name: "a tab onto the favourites", does: dragged(tab(3), favorites), shows: "favs 3 | pins 0 | tabs 4" },
      { name: "an open favourite deleted, which closes its tab", does: deleted(pin(3)), shows: "pins 0 | tabs 4" }
    ]
  },
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
        name: "the pinned tab held over the second space's button, then to a place in that space's list, which unpins it there",
        does: async () => {
          await shownSpace(0)();
          await draggedThroughButton(pin(0), 1, after(tab(1)));
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
      }
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
      {
        name: "a pinned tab onto the other profile's space's button, which takes none",
        does: refused(pin(5), spaceButton(2)),
        shows: "pins 5 / nothing / tabs {3 4} (2|1) 0"
      }
    ]
  }
];
