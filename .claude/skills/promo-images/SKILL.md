---
name: promo-images
description: Make a Wren-themed image in the look of Wren's disk image and website, with a sky in a space's colour, soft clouds, a low sun, the wren, and Geist with a serif italic flourish, drawn as an HTML page and rendered to PNG in headless Chrome. Use whenever the user wants a promo image, social post or card, banner, Open Graph image, release or announcement graphic, store or press image, wallpaper, poster, or "something Wren themed", even if they don't call it any of these. Not for icons inside the app (tile-icons) or charts (dataviz).
---

# Promo images

Each image is one HTML page, so it stays editable. To change an image later, change its page and draw it again. `branding/dmg/background.html` is the finished example. The look comes from the website, in `../wren-browser-website`, mainly `src/components/sky.tsx` and `src/app/opengraph-image.tsx`. Every Wren image should look like part of one world, a calm sky with a small bird in it.

## Making one

1. **Work out what it's for.** Settle where it will be seen, its size, and the one thing it says. If the user left these open, choose, and say what you chose.
2. **Copy the starter.** Its paths work from that folder:

   ```sh
   mkdir branding/promo/<name>
   cp .claude/skills/promo-images/scene.html branding/promo/<name>/promo.html
   ```

3. **Set its size and compose it.** Set its `<meta name="size">`, then lay it out for this image. The starter's layout is a sample to move, not a template to fill in.
4. **Draw it,** and read the PNG it writes beside the page:

   ```sh
   bun .claude/skills/promo-images/render.ts branding/promo/<name>/promo.html
   ```

5. **Go round again until it's right.** Check it against [Composing](#composing), at full size and shrunk to the size it will be seen at.
6. **`open` the PNG for the user.** Git ignores everything in `branding/promo/`, because these images are thrown away after use, so never commit one. Each image keeps its own folder, with `promo.html` beside `promo.png` and anything else it uses, so it can be edited and drawn again later.

## The look

**Colour comes from a space.** Each space has a sky colour, `--space`, and a deeper one for text and birds, `--ink`. Pick the one that suits the image, and use one for each image.

| Space    | `--space` | `--ink`   |
| -------- | --------- | --------- |
| Personal | `#7a81ff` | `#4f55d6` |
| Work     | `#34b394` | `#0f7a62` |
| Studio   | `#f0845f` | `#c2481f` |

Personal's colour is Wren's accent, so use it when nothing says otherwise. Text is `#16171c`, and secondary text is `#55565e`.

**The sky** is the starter's gradient, from the space's colour at the top to warm peach at the horizon. A Personal sky stays lavender into peach, so don't add other hues.

**Night suits a technical subject,** such as "under the hood". Use a `#15171c` background, white text, `--ink` and the flourish in `#a5aaff`, and a scatter of 2px white stars at 25 to 60% opacity, kept clear of the text. Leave out the sun, the clouds and the peach.

**Use scenery sparingly.** All of it is in the starter:

- The clouds are `#puffs`, in layers. Far ones are faint and blurred, near ones have shaded undersides, and banks rise from the bottom corners. A bank hides the bottom edge, so it suits an image's foot. Scale a bank wider than it is tall.
- The sun sits low, cut off by an edge, with its glow around it.
- A flock is three distant birds, large to small, at about 55% opacity.

**The wren** is `#wren`, from the branding files. Draw it flat in `--ink`, or white with `filter="url(#lift)"` when it flies across the sky. It faces right. Flip it to perch facing left, and tilt it by a few degrees at most. It can perch on something, such as a window's edge, a word or a tab, or fly along a dotted path, as in the disk image. Never fill it with a gradient or redraw it.

**Type.** Use Geist Medium for words, and Geist Mono Medium for small details, such as a version or an address. Set one or two words of a heading in Instrument Serif italic in `--ink`, as the heading's one flourish. Those three files are the only fonts, each in only that weight. Track large Geist tightly, at about -0.03em. Pick the serif word for its meaning, as in "big _lives_", "Flow has _fledged_" and "Take Wren for a _flight_".

**Finish.** Keep the grain layer on top, because it stops gradients banding. Pills are white at 82%, with a soft shadow tinted by `--ink`.

**A screenshot of Wren** goes in `.window`. Use the website's `public/shots/hero-personal.webp`, `hero-work.webp` or `hero-studio.webp`, each 2080 by 1300, at `../../../../wren-browser-website/public/shots/…` from the page, and match its space to the sky's. These shots already include the window, so don't draw one around them. If what's being announced isn't in them, ask the user for a screenshot rather than mocking up Wren's interface.

## Words

Keep them few, in the website's voice: plain, warm and a little playful, with bird puns only where they earn their place. The tagline is "A small browser for _big lives_".

Say only what's true of Wren. The website's `src/app/page.tsx` and the latest release notes show what that is, so don't invent features, numbers or dates. Take a version from the app, not from memory. Never name another browser, whether in the image, the page's source or its file name. The address is `wrenbrowser.com`.

## Composing

The disk image took several rounds of the user's feedback. What they said applies to every image:

- **Craft it.** The first complaint was that it looked blank and generic. Give each image one idea, particular to what it says. A wren perched on the thing being announced beats a logo above a sentence.
- **No dead space, but room to breathe.** Empty stretches read as unfinished, and a tight fit feels cramped. Size the elements and the canvas to each other, rather than spreading things out to fill a size.
- **Clean, then polished.** Polish comes from depth and small touches, such as a soft glow, shaded cloud undersides or a line that strengthens along its length, not from more objects. Take away whatever isn't helping before adding anything.
- **Everything must read.** Clouds need a sky dark enough to show against, and text must clear the scenery. Check it at its real size. A social card is seen small, so its heading must be large.

The common sizes are Open Graph 1200×630, an X post 1200×675, a square post 1080×1080, a story 1080×1920, a GitHub social preview 1280×640, and a wallpaper at the screen's size, with no words. The default `--scale 2` doubles the pixels. Use `--scale 1` for a wallpaper, and when a site wants exactly the size it names.

## Keep to the brand

Wren's name, logos and icons are trademarks (`TRADEMARKS.md`), and everything in `branding/` keeps its rights reserved. An image of them is Wren's own material, not something to offer as free to reuse. The fonts' licences are in `branding/dmg/fonts`.

The disk image's page is `branding/dmg/background.html`. Leave it alone unless the user asks to change the disk image, because `scripts/dmg.ts` depends on its size and on where its icons sit.
