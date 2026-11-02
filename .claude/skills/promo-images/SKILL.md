---
name: promo-images
description: Make a Wren-themed image in the look of Wren's disk image and website, with a Space-coloured sky, soft clouds, a low sun, the wren and Geist with a serif italic flourish, drawn as an HTML page and rendered to PNG in headless Chrome. Use whenever the user wants a promo image, social post or card, banner, Open Graph image, release or announcement graphic, store or press image, wallpaper, poster, or "something Wren themed", even if they don't call it any of these. Not for icons inside the app (tile-icons) or charts (dataviz).
---

# Promo images

An image is one HTML page, so it stays editable: to change it later, change the
page and draw it again. `branding/dmg/background.html` is the finished example,
and the website (`../wren-browser-website`, `sky.tsx` and `opengraph-image.tsx`)
is where the look comes from. Wren's images should look like one world: a calm
sky with a small bird in it.

## Making one

1. Work out what it is for: where it will be seen, its size, and the one thing
   it says. If the user left these open, choose and say what you chose.
2. Copy the starter, whose paths work from that folder:

   ```sh
   mkdir branding/promo/<name>
   cp .claude/skills/promo-images/scene.html branding/promo/<name>/promo.html
   ```

3. Set its `<meta name="size">`, then compose it for this image. The starter's
   layout is a sample to move, not a template to fill in.
4. Draw it, and read the PNG it writes beside the page:

   ```sh
   bun .claude/skills/promo-images/render.ts branding/promo/<name>/promo.html
   ```

5. Look hard and go round again until it is right. Check the list under
   [Composing](#composing), at full size and shrunk to where it will be seen.
6. `open` the PNG for the user. Everything in `branding/promo/` is ignored by
   git, as these images are thrown away after use: don't commit one. Each image
   has its own folder, `promo.html` beside `promo.png`, with anything else it
   uses, so it can be edited and drawn again later.

## The look

**Colour comes from a Space.** Each has a sky colour (`--space`) and a deeper
one for text and birds (`--ink`). Pick the one that suits the image, and use
one per image.

| Space    | `--space` | `--ink`   |
| -------- | --------- | --------- |
| Personal | `#7a81ff` | `#4f55d6` |
| Work     | `#34b394` | `#0f7a62` |
| Studio   | `#f0845f` | `#c2481f` |

Personal's is Wren's accent, and the one to use when nothing says otherwise.
Text is `#16171c`, secondary text `#55565e`.

**Sky.** The gradient in the starter: the Space's colour at the top, falling to
warm peach at the horizon. A sky of Personal stays lavender into peach, so don't
add other hues.

**Night, for a technical subject** ("under the hood"). Background `#15171c`,
white text, `--ink` and the flourish in `#a5aaff`, a scatter of 2px white stars
at 25–60% opacity kept clear of the text, and no sun, clouds or peach.

**Scenery, used sparingly.** All of it is in the starter:

- Clouds are `#puffs`, in layers: faint and blurred far off, shaded undersides
  close to, and banks rising from the bottom corners. Banks hide the bottom
  edge, so they suit an image's foot; scale them wider than tall.
- The sun sits low and is cut off by an edge, with its glow around it.
- A flock is three distant birds, large to small, at about 55% opacity.

**The wren** is `#wren`, from the branding files. It is flat in `--ink`, or
white when it flies across the sky with `filter="url(#lift)"`. It faces right;
flip it to perch facing the other way, and tilt it by no more than a few degrees.
It can perch on something (a window's edge, a word, a tab), or fly along a dotted
path, as in the disk image. Never recolour it in a gradient or redraw it.

**Type.** Geist Medium for words, Geist Mono Medium for small details (a
version, the address). One or two words of a heading are in Instrument Serif
italic in `--ink`, and that is the one flourish in a heading. Those three files
are the only fonts, and each has only that weight. Tight tracking on large Geist
(about -0.03em). Pick the serif word for its meaning: "big _lives_", "Flow has
_fledged_", "Take Wren for a _flight_".

**Finish.** The grain layer stays on top, as it stops gradients banding. Pills
are white at 82% with a soft shadow tinted by `--ink`.

**A screenshot of Wren** goes in `.window`, from the website's
`public/shots/hero-personal.webp`, `hero-work.webp` or `hero-studio.webp` (2080
by 1300), at `../../../../wren-browser-website/public/shots/…` from the page. Match
its Space to the sky's. These images already include the window, so don't draw
one around them. If what is being announced is not in these shots, ask for a
screenshot rather than mocking up Wren's interface.

## Words

Keep them few, in the site's voice: plain, warm, a little playful, and bird
puns only when they earn it. The tagline is "A small browser for _big lives_".

Say only what is true of Wren, which the website's `src/app/page.tsx` and the
latest release notes will show: don't invent features, numbers or dates. A
version comes from the app, not memory. Never name another browser, whether in
the image, the page's source or its file name. `wrenbrowser.com` is the address.

## Composing

The disk image took several rounds of the user's feedback. What they said
applies to every image:

- **Craft it.** Blank and generic was the first complaint: have one idea per
  image, and make it particular to what the image says. A wren perched on the
  thing being announced beats a logo above a sentence.
- **No dead space, but room to breathe.** Empty stretches read as unfinished,
  and fit too tightly it feels hard to breathe. Size the elements and the canvas
  to each other rather than spreading things out to fill a size.
- **Clean, then polished.** Polish is in depth and small touches (a soft glow,
  shaded cloud undersides, a line that strengthens along its length), not more
  objects. Take away whatever isn't helping before adding anything.
- **Things must read.** Clouds need a sky dark enough to show against, and text
  must clear the scenery. Check that it holds up at its real size: a social card
  is seen small, so its heading must be large.

Common sizes: Open Graph 1200×630, X post 1200×675, square post 1080×1080, story
1080×1920, GitHub social preview 1280×640, and wallpaper at the screen's size
with `--scale 1`, without words. The default `--scale 2` doubles the pixels; use
`--scale 1` if a site wants exactly the size named.

## Keep to the brand

Wren's name, logos and icons are trademarks (`TRADEMARKS.md`), and everything in
`branding/` keeps its rights reserved, so an image of them is Wren's own material
rather than something to offer as free to reuse. The fonts' licences are in
`branding/dmg/fonts`.

The disk image's own page is `branding/dmg/background.html`. Leave it to
`scripts/dmg.ts`, which depends on its size and where its icons sit, unless the
user is asking to change the disk image.
