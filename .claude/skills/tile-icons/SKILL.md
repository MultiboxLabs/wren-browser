---
name: tile-icons
description: Draw an icon of Wren's own the way macOS System Settings draws its icons, as a white filled glyph on a rounded, lit tile of colour (TileIcon, src/renderer/components/tile-icon.tsx). Use when a UI needs an icon for something that is no app's but sits among app icons or reads as a setting or an option, such as an option of a setup step, a settings row or a choice card. Also use when the user asks for "those tile icons", "settings-style icons" or an icon drawn by hand instead of Lucide.
---

# Tile icons

An icon that stands for an option, a setting or a feature beside real app icons must look like the platform's, not like a web icon set. Lucide's stroked glyphs read as web. A tile icon reads as macOS's own: a filled white glyph on a rounded square of colour, lit from above, with a hairline of light round its top edge and a soft shadow.

`TileIcon` in `src/renderer/components/tile-icon.tsx` already draws the tile, with its shape, gradient, edge and shadow. What you draw for each icon is the glyph, by hand, as SVG. To see the icons drawn so far, search the renderer for `TileIcon`.

Use a tile icon where an app's icon or a System Settings icon would sit, and keep Lucide for toolbar and menu glyphs. A glyph drawn by these rules without its tile, in the text's colour, stands in for a site's icon. Chromium's own pages get theirs this way, in `src/renderer/components/page-icon.tsx`.

## Drawing one

```tsx
import { CUT, TileIcon } from "@/components/tile-icon";

/** What it stands for, in a line. */
export function ShieldIcon({ size = 44 }: { size?: number }) {
  return (
    <TileIcon tone="green" size={size}>
      {(id) => (
        <>
          <mask id={`${id}-cut`}>
            <rect width="100" height="100" fill="#fff" />
            <path d="M38.5 50.5 47 59l15-17.5" strokeWidth="7" {...CUT} />
          </mask>
          <path mask={`url(#${id}-cut)`} fill="#fff" d="…the shield…" />
        </>
      )}
    </TileIcon>
  );
}
```

1. **Pick a tone** from `TONES` that means the thing. Use green for safe or on, `wren`, the stable icon's indigo, for Wren itself, grey or slate for off, not now or neutral, and sky for new. Purple and indigo are there too. A new tone goes in `TONES` as two colours of one hue, as the system's are. The top one is lighter and a little less saturated, and the bottom one is about 25 to 35% darker.
2. **Draw the glyph in the tile's 100 units.** Keep it within about 20 to 80 on both axes, the margin the system leaves. Centre it by eye, by its weight rather than its bounding box. Fill shapes rather than stroke them, with round joins, and round every corner a little, by 2 to 5 units.
3. **Make it solid white.** The glyph is `#fff`. Cut a detail inside it, such as a tick or a clock's hands, out of it with a mask, so the tile shows through. The mask is a white rect, then the detail as a black stroke (`CUT`), 6 to 7 units wide. Name each mask from the `id` the child function gets, never a fixed string, because two of one icon on a page would share a fixed one.
4. **Use colour inside sparingly.** A glyph that pictures something, such as a page with ads, may hold a few flat colours on its white, as an app's icon does. The rest stays pure white.
5. **Lay a mark of its own over the tile.** Wren's bird isn't drawn in the tile. Put `<TileIcon tone="wren" size={size} />` in an absolutely placed box, and centre the mark on it in `text-white`, at about 58% of the size.

### Shapes that work

- A four-point sparkle centred on (cx, cy), with radius r and a = 0.18r: `M cx,cy-r C cx+a,cy-a cx+a,cy-a cx+r,cy C cx+a,cy+a … Z`, round all four sides. Big and small sparkles together read as new.
- A shield, a clock face, a page or a window, from rounded rects and circles, with the details cut out.
- Avoid thin lines and outlines. At 32 points they turn grey and read as web.

## Sizes

- **Among app icons,** such as a list of installed browsers, draw the tile at about 82% of the icons' box, because an app icon's art leaves a margin in its box: `<span className="grid size-10 place-items-center"><FreshIcon size={33} /></span>`.
- **On its own,** such as on an option card, draw it at 44 points.

## Seeing it before the app

The user may be running Wren, and a launch takes a build, so look at the icon on its own first. Copy the tile and the glyph into a plain SVG in an HTML page, on the window's dark and light greys. The tile's path, gradients and edge are in `tile-icon.tsx`. Render the page with headless Chrome:

```sh
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless \
  --disable-gpu --allow-file-access-from-files --window-size=620,150 \
  --force-device-scale-factor=2 --screenshot=/tmp/icons.png file:///tmp/icons.html
```

Then read the PNG. Put the new icon beside the ones already drawn, and check it's one of their family, as heavy, as large in its tile and as bright. Show the user that picture.

## Don'ts

- Don't put a Lucide glyph on a tile. A stroked glyph on a filled tile is what looked cheap, so draw the glyph.
- Don't change the tile's shape, edge or shadow for one icon. Change `TileIcon`, so every icon keeps matching.
- Don't name another browser in a glyph's comment or name. An icon for importing isn't named for where from.
