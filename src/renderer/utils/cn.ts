// Joins class names, and where two Tailwind classes conflict keeps the later.
// The theme's own sizes, radii and shadows (src/renderer/index.css) are named
// here: unnamed, `text-omnibox-row` would be taken for a text colour, and
// dropped for the `text-white` after it.

import { createCn } from "cn/config";

export const cn = createCn({
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
      shadow: [{ shadow: ["tooltip", "menu", "omnibox-chip", "raised", "field"] }]
    }
  }
});
