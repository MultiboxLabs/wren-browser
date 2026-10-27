---
name: tile-icons
description: Draw a native-looking icon of Wren's own, as macOS System Settings draws its icons — a white filled glyph on a rounded, lit tile of colour (TileIcon, src/renderer/components/tile-icon.tsx). Use when a UI needs an icon for something that is no app's but sits among app icons or reads as a setting or option (an option of a setup step, a settings row, a choice card), or when the user asks for "those tile icons", "settings-style icons" or an icon drawn by hand instead of Lucide.
---

# Tile icons

Wren is a native desktop app, so an icon that stands for an option, a
setting or a feature next to real app icons should look like the platform's,
not like a web icon set. Lucide's stroked glyphs read as web; these read as
macOS's own: a **filled white glyph on a rounded square of colour, lit from
above**, with a hairline of light round its top edge and a soft shadow.

The tile is done: `TileIcon` in `src/renderer/components/tile-icon.tsx`
draws the shape, its gradient, its edge and its shadow. What is drawn per
icon is the glyph, by hand, as SVG. To see the ones drawn so far, search
the renderer for `TileIcon`.

Keep Lucide for toolbar and menu glyphs; use a tile icon where an app's
icon or a System Settings icon would sit.

## Drawing one

```tsx
import { CUT, TileIcon } from "../../components/tile-icon";

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

1. **Pick a tone** from `TONES` (green, grey, wren, slate, sky). One that
   means the thing: green for safe or on, warm `wren` for Wren itself, grey
   or slate for "off", "not now" or neutral, sky for new or fresh. A new
   tone goes in `TONES`: two colours of one hue, the top lighter and a
   little less saturated, the bottom deeper (about 25–35% darker), as the
   system's are.
2. **Draw the glyph in the tile's 100 units.** Keep it in about 20–80 on
   both axes (the system leaves that margin), centred by eye: weight, not
   bounding box. Shapes are **filled**, not stroked, with round joins and
   soft corners (round every corner a little, 2–5 units).
3. **White, solid.** The glyph is `#fff`. A detail inside it (a tick, a
   clock's hands) is **cut out** of it with a mask, so the tile shows
   through: a white rect, then the detail as a black stroke (`CUT`, 6–7
   units wide). Name masks from the `id` the child function gets, never a
   fixed string: two of one icon on a page would share it.
4. **Colour inside, sparingly.** A glyph that pictures something (a page
   with ads) may hold a few flat colours on its white, like an app's icon
   does; the rest stay pure white.
5. **A mark of its own** (Wren's bird) is laid over the tile instead of
   drawn in it: `<TileIcon tone="wren" size={size} />` in an absolutely
   placed box, and the mark centred on it in `text-white` at about 58% of
   the size.

### Shapes that work

- Four-point sparkle at centre (cx, cy), radius r, with a = 0.18r:
  `M cx,cy-r C cx+a,cy-a cx+a,cy-a cx+r,cy C cx+a,cy+a … Z` round all four
  sides. Big and small ones together read as "new".
- Shield, clock face, page or window: rounded rects and circles, details
  cut out.
- Avoid thin lines and outlines: at 32 points they go grey and read as web.

## Sizes

- **Among app icons** (a list of installed browsers): an app icon's art
  leaves a margin in its box, so draw the tile at about 82% of the box, in
  a box of the icons' size: `<span className="grid size-10 place-items-center"><FreshIcon size={33} /></span>`.
- **On its own** (an option card's): 44 points.

## Seeing it before the app

The app may be running for the user, and a launch takes a build; look at
the icon alone first. Copy the tile and glyph into a plain SVG in an HTML
page (the tile's path, gradients and edge are in `tile-icon.tsx`) on the
window's dark and light greys, and render it with headless Chrome:

```sh
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless \
  --disable-gpu --allow-file-access-from-files --window-size=620,150 \
  --force-device-scale-factor=2 --screenshot=/tmp/icons.png file:///tmp/icons.html
```

Then Read the PNG. Put the new icon beside the ones drawn already (search
for `TileIcon`) to see that it is of their family: as heavy, as large in
its tile, as bright. Show the user that picture.

## Don'ts

- Don't put a Lucide glyph on the tile: a stroked glyph on a filled tile is
  what looked cheap. Draw the glyph.
- Don't change the tile's shape, edge or shadow for one icon; change
  `TileIcon`, so every one keeps matching.
- Don't name another browser in a glyph's comment or name (an icon for
  "importing" is not named for where from).
