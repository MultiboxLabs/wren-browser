// The theme's own sizes, radii and shadows (src/renderer/index.css, and the component files it imports), named
// for `cn`: unnamed, `text-omnibox-row` would be taken for a text colour,
// and dropped for the `text-white` after it. The build compiles `cn`'s
// tables from this (cn-tables.ts); it is not part of the page.

import { validators } from "cn/config";

export default {
  extend: {
    classGroups: {
      "font-size": [
        { text: ["ui", "menu-item", "caption", "subtitle", "omnibox-row", "omnibox-large", "dialog-title"] }
      ],
      rounded: [
        {
          rounded: [
            "favicon",
            "menu-item",
            "card",
            "tooltip",
            "control",
            "menu",
            "row",
            "panel",
            "field",
            "popover",
            "tile",
            "omnibox",
            "omnibox-row",
            "omnibox-icon"
          ]
        }
      ],
      shadow: [{ shadow: ["tooltip", "menu", "omnibox-chip", "raised", "overlay", "field"] }],
      // Liquid Glass (index.css): one kind of glass, and one tint, wins.
      glass: ["glass", "glass-clear"],
      "glass-tint": [{ "glass-tint": [validators.isAny] }]
    }
  }
};
