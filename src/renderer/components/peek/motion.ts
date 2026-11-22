// How a peek comes and goes (peek.tsx).
//
// Its card grows out of where the pointer was as the peek came, most often
// the link it was opened from, as a genie does, and goes back into it as it
// closes, its sides bending in toward the link on the way (bend.ts). Its
// corners shrink toward the link's and stay round, and it fades only over
// the last of its way back. The buttons pop in beside the card once it
// has landed. Expanding, the page takes the whole box's place and size at
// once, and the card's frame grows round it to fill the box, taking on a
// tab's look. With Reduced Motion, everything fades only. The tabs behind
// darken and brighten by themselves as the peek comes and goes (peek.css).
//
// The card bends on its way, which the page in it can't, so it is drawn in a
// canvas meanwhile (genie.ts), and its page is hidden until it has landed:
// by its colour as it comes, as its page has drawn nothing yet, and by a
// picture of its page as it goes. The card is the peek's slot in
// tab-view.tsx, which this page doesn't render, so it is hidden and moved by
// hand, as are the buttons, so they keep time with it.

import { Genie, type Place, type Shadow } from "./genie";
import { clamp, mix, remaining, sample, settling, smoothstep } from "./spring";
import { bendOf, type Rect } from "./bend";
import { cssEase, EASE_OUT, prefersReducedMotion } from "@/utils/motion";

/** A peek's parts that move: its card (the slot), the canvas it is drawn in on its way, which shares its box, and the buttons. */
export type PeekParts = { card: HTMLElement; canvas: HTMLCanvasElement; buttons: HTMLElement[] };

// What the card grows out of: a link's size round the pointer, and how
// round its corners are there.
const LINK = { width: 80, height: 20, corner: 4 };
// The longest a frame of the card's way may take, in seconds, before the way
// waits for it.
const LONGEST_FRAME = 1 / 30;
// Closing, the card fades out over the last of its way back, once it is
// nearly in the link, so it is seen going all the way into it.
const FADE_AT = 0.25;
// Opening, how long the card's colour takes to give way to its page once
// it has landed.
const REVEAL = 0.1;
// Expanding: quick, on a strong ease-out, so nearly all of the way is made
// in its first frames and it reads as fast.
const EXPAND = { duration: 0.15, ease: cssEase(EASE_OUT) };
// How long Chromium may take to draw a page at a new size, which an
// expanding frame waits for, its page covered, before it grows. A guess:
// Wren Runtime doesn't say when a page has drawn at its new size. 60 ms
// was too short for a quick frame, which showed the old drawing as it grew.
const RESIZED = 0.1;
// The buttons: a pop from small with a little overshoot, one after another.
const BUTTON = { from: 0.4, response: 0.32, damping: 0.7, stagger: 0.05, fade: 0.14 };
// Reduced Motion's fades.
const FADE = 0.15;

// Each canvas's genie, made the first time it is asked for.
const genies = new WeakMap<HTMLCanvasElement, Genie | null>();
// What stops the card each canvas is drawing on its way, and whether it is
// going, which goes on after its peek has closed.
const drawing = new WeakMap<HTMLCanvasElement, { stop: () => void; closing: boolean }>();
// What puts each expanding card and the tabs behind it back as they were.
const restoring = new WeakMap<HTMLElement, () => void>();

/**
 * Brings the peek in, out of `from` in the page (`Peek.from`), or out of
 * the card's middle without it, and answers once its card has landed and
 * its page shows.
 */
export async function enterPeek(parts: PeekParts, from: [number, number] | null) {
  stop(parts);
  const genie = genieOf(parts.canvas);
  if (prefersReducedMotion() || !genie) {
    for (const part of [parts.card, ...parts.buttons]) fade(part, 0, 1, FADE, false);
    return;
  }
  for (const button of parts.buttons) button.style.opacity = "0";
  genie.show(null, colourOf(parts.card));
  if (!(await travel(parts, genie, from, true))) return;
  // Its page shows once it has landed, fading in through the card as it was
  // drawn rather than taking its place at once, and the buttons then come.
  parts.buttons.forEach((button, index) => popIn(button, index * BUTTON.stagger));
  const reveal = parts.canvas.animate([{ opacity: 1 }, { opacity: 0 }], {
    duration: REVEAL * 1000,
    easing: "ease-out",
    fill: "forwards"
  });
  // Held faded until the canvas is clear, so it never shows the card again.
  // Stopped, `stop` clears it.
  const revealed = await reveal.finished.then(
    () => true,
    () => false
  );
  if (revealed) {
    genie.clear();
    reveal.cancel();
  }
}

/**
 * Takes the peek back into `from` (as `enterPeek`), drawn by `picture` of
 * its page, or its colour without one, and answers once it has gone. Its
 * page and buttons are hidden at once, and the canvas draws the card, so
 * the peek may close as this starts: the canvas isn't the peek's
 * (tab-view.tsx), and goes on drawing once it has.
 */
export async function closePeek(parts: PeekParts, from: [number, number] | null, picture: HTMLImageElement | null) {
  stop(parts);
  for (const button of parts.buttons) button.style.opacity = "0";
  const genie = genieOf(parts.canvas);
  if (prefersReducedMotion() || !genie) {
    await fade(parts.card, 1, 0, FADE);
    return;
  }
  genie.show(picture, colourOf(parts.card));
  await travel(parts, genie, from, false);
}

/**
 * Grows the card's frame to fill the box as the tabs behind brighten, and
 * answers once it has. `join` names the box's edges that meet another card
 * (tab-view.tsx), whose corners on the tab it becomes are square.
 *
 * Its page doesn't move with it: it takes the place and size it has in the
 * whole box at once, so it lays itself out once only, and stays there as
 * the frame, clipping it, reveals more of it. As a page takes a new size,
 * Chromium draws it at its old one for a frame or two, from the element's
 * top left, which would show the page's old drawing moved. So `picture` of
 * the page as it was covers the card meanwhile, and the frame grows once
 * Chromium has drawn the page anew. Without one, the frame grows at once.
 * All of it is held there until `stop`, once its page is a tab of the
 * list's, which fills the box anyway.
 */
export async function expandPeek(parts: PeekParts, picture: HTMLImageElement | null, join: string | undefined) {
  stop(parts);
  for (const button of parts.buttons) button.style.opacity = "0";
  const { card, canvas } = parts;
  const box = card.offsetParent as HTMLElement;
  // The tabs behind brighten as it grows: the darkening is theirs (peek.css).
  const behind = [...box.querySelectorAll<HTMLElement>(":scope > [data-behind-peek]")];
  const brighten = (duration: number, easing: string) =>
    behind.map((tab) =>
      tab.animate([{ filter: getComputedStyle(tab).filter }, { filter: "brightness(1)" }], {
        duration: duration * 1000,
        easing,
        fill: "forwards"
      })
    );
  const face = faceOf(card);
  const page = face?.querySelector<HTMLElement>(":scope > [data-peek-page]");
  if (prefersReducedMotion() || !face || !page) {
    const brightening = brighten(FADE, "ease-out");
    restoring.set(card, () => {
      for (const animation of brightening) animation.cancel();
    });
    await Promise.all(brightening.map((animation) => animation.finished));
    return;
  }

  const width = box.clientWidth;
  const height = box.clientHeight;
  const inset = {
    top: card.offsetTop,
    right: width - card.offsetLeft - card.offsetWidth,
    bottom: height - card.offsetTop - card.offsetHeight,
    left: card.offsetLeft
  };
  // Below the address bar atop it, if it has one.
  const bar = page.offsetTop;
  const brightening = brighten(EXPAND.duration, EXPAND.ease);

  // The page as it was, over the card, as it takes its place in the whole
  // box under it.
  const genie = picture ? genieOf(canvas) : null;
  if (genie && picture) {
    const shown: Rect = {
      left: card.offsetLeft,
      top: card.offsetTop + bar,
      width: page.offsetWidth,
      height: page.offsetHeight
    };
    const resting: Place = (u, v) => [shown.left + u * shown.width, shown.top + v * shown.height];
    genie.show(picture, colourOf(card));
    const corner = cornerOf(face);
    genie.draw({ width, height }, shown, resting, {
      corner: { top: corner, bottom: corner },
      opacity: 1,
      edge: edgeOf()
    });
  }
  const px = (value: number) => `${value}px`;
  const laidOut = {
    position: "absolute",
    left: px(-inset.left),
    top: px(bar - inset.top),
    width: px(width),
    height: px(height - bar)
  };
  Object.assign(page.style, laidOut);
  let stopped = false;
  const growing: Animation[] = [];
  restoring.set(card, () => {
    stopped = true;
    for (const animation of [...growing, ...brightening]) animation.cancel();
    for (const property of Object.keys(laidOut)) page.style.removeProperty(property);
  });
  if (genie) {
    await new Promise((resolve) => setTimeout(resolve, RESIZED * 1000));
    genie.clear();
    if (stopped) return;
  }

  // The frame from the card's insets to none, and the page against it, so
  // it stays where it is in the whole box; and the frame's look from the
  // peek's to a tab's, as its inner edge fades, so it ends as the tab it
  // becomes. All on the same curve, so they keep time exactly.
  const timing: KeyframeAnimationOptions = {
    duration: EXPAND.duration * 1000,
    easing: EXPAND.ease,
    fill: "forwards"
  };
  growing.push(
    card.animate(
      [
        { top: px(inset.top), right: px(inset.right), bottom: px(inset.bottom), left: px(inset.left) },
        { top: "0px", right: "0px", bottom: "0px", left: "0px" }
      ],
      timing
    ),
    page.animate(
      [
        { left: px(-inset.left), top: px(bar - inset.top) },
        { left: "0px", top: px(bar) }
      ],
      timing
    ),
    face.animate([lookOf(face), tabLook(box, join)], timing)
  );
  const edge = face.querySelector<HTMLElement>(":scope > .peek-edge");
  if (edge) growing.push(edge.animate([{ opacity: 1 }, { opacity: 0 }], timing));
  await Promise.all([...growing, ...brightening].map((animation) => animation.finished));
}

/**
 * Stops whatever of the peek is moving, leaving each part as it rests; but
 * with `keepClosing`, not a card on its way back, which goes on once its
 * peek has closed.
 */
export function stop(parts: PeekParts, { keepClosing = false } = {}) {
  const drawn = drawing.get(parts.canvas);
  if (drawn && !(drawn.closing && keepClosing)) drawn.stop();
  restoring.get(parts.card)?.();
  restoring.delete(parts.card);
  for (const animation of parts.canvas.getAnimations()) animation.cancel();
  genies.get(parts.canvas)?.clear();
  for (const part of [parts.card, ...parts.buttons]) {
    for (const animation of part.getAnimations()) animation.cancel();
    part.style.opacity = "";
  }
}

// Draws the card's way out of the link and in, or back, in the canvas, its
// page hidden meanwhile, and answers whether it got there. As it comes, its
// page shows once it has landed; as it goes, it stays hidden.
function travel(parts: PeekParts, genie: Genie, from: [number, number] | null, opening: boolean): Promise<boolean> {
  const { card, canvas } = parts;
  // The canvas shares the card's box, so the card's place in it is its own.
  const box = canvas.getBoundingClientRect();
  const rest: Rect = { left: card.offsetLeft, top: card.offsetTop, width: card.offsetWidth, height: card.offsetHeight };
  // The link round the pointer; round the card's middle without one.
  const x = from ? from[0] - box.left : rest.left + rest.width / 2;
  const y = from ? from[1] - box.top : rest.top + rest.height / 2;
  const link: Rect = { left: x - LINK.width / 2, top: y - LINK.height / 2, width: LINK.width, height: LINK.height };

  const bend = bendOf(rest, link, box.height, opening);
  const { duration } = bend;
  const face = faceOf(card) ?? card;
  const corner = cornerOf(face);
  const edge = edgeOf();
  const shadow = shadowOf(face);

  // A frame, its shadow drawn with it unless `shadowed` is false.
  const frame = (t: number, shadowed = true) => {
    const { place, scale, away, left } = bend.at(t);
    // Each edge's corners turn into the link's as that edge nears it, and
    // are drawn larger in the card as it is drawn smaller, so they look the
    // same size on the way.
    const cornerAt = (amount: number, small: number) => mix(corner, LINK.corner, amount) / small;
    const opacity = opening ? 1 : smoothstep(clamp(left / FADE_AT, 0, 1));
    genie.draw(box, rest, place, {
      corner: { top: cornerAt(away.top, scale.top), bottom: cornerAt(away.bottom, scale.bottom) },
      opacity,
      edge,
      shadow: shadowed ? shadow : undefined
    });
  };

  card.style.opacity = "0";
  frame(0);
  return new Promise((resolve) => {
    let last: number | null = null;
    let elapsed = 0;
    let request = 0;
    const end = (landed: boolean) => {
      cancelAnimationFrame(request);
      drawing.delete(canvas);
      // Landed, its page shows under the card as it rests, which then
      // gives way to it (`enterPeek`); and its shadow, which the card's own
      // then draws.
      if (opening && landed) frame(duration, false);
      else genie.clear();
      if (opening || !landed) card.style.opacity = "";
      resolve(landed);
    };
    drawing.set(canvas, { stop: () => end(false), closing: !opening });
    // Timed from the first frame drawn, so none of the way is lost while the
    // page is busy bringing the peek in; and a frame late, as Chromium makes
    // the peek's page, moves it on by `LONGEST_FRAME` at most, so the card
    // slows rather than jumps.
    const step = (now: number) => {
      elapsed += Math.min(now - (last ?? now), LONGEST_FRAME * 1000);
      last = now;
      const t = elapsed / 1000;
      if (t >= duration) return end(true);
      frame(t);
      request = requestAnimationFrame(step);
    };
    request = requestAnimationFrame(step);
  });
}

// The card's frame in its slot (tab-view.tsx), which draws its corners.
function faceOf(card: HTMLElement): HTMLElement | null {
  return card.querySelector<HTMLElement>(":scope > .card");
}

// How round `face`'s corners are, in points.
function cornerOf(face: HTMLElement): number {
  return parseFloat(getComputedStyle(face).borderTopLeftRadius) || 0;
}

// The widest of `face`'s shadows (`--card-lift` in peek.css), to draw under
// the card on its way, or none.
function shadowOf(face: HTMLElement): Shadow | undefined {
  let widest: Shadow | undefined;
  // As Chromium gives a shadow: its colour first, then its offsets and blur.
  for (const [, colour, drop, blur] of getComputedStyle(face).boxShadow.matchAll(
    /rgba?\(([^)]*)\)\s+-?[\d.]+px\s+(-?[\d.]+)px\s+([\d.]+)px/g
  )) {
    const alpha = Number(colour.split(/[\s,/]+/)[3] ?? 1);
    if (!widest || Number(blur) > widest.blur) widest = { drop: Number(drop), blur: Number(blur), alpha };
  }
  return widest && widest.blur > 0 ? widest : undefined;
}

// How opaque the peek's inner edge is (`--peek-edge` in peek.css), or not
// at all without it.
function edgeOf(): number {
  return parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--peek-edge")) || 0;
}

// The colour of the card under its page (`.peek-under`), for a page that has
// drawn nothing.
function colourOf(card: HTMLElement): string {
  const under = card.querySelector(".peek-under");
  return under ? getComputedStyle(under).backgroundColor : "white";
}

// What of a card's look changes from a peek's to a tab's: its corners, its
// edge and shadow, and the clip that cuts the shadow where it meets another
// card (card.css).
function lookOf(card: HTMLElement): Keyframe {
  const style = getComputedStyle(card);
  return {
    borderTopLeftRadius: style.borderTopLeftRadius,
    borderTopRightRadius: style.borderTopRightRadius,
    borderBottomRightRadius: style.borderBottomRightRadius,
    borderBottomLeftRadius: style.borderBottomLeftRadius,
    boxShadow: style.boxShadow,
    clipPath: style.clipPath
  };
}

// The look of a tab's card in `box`, meeting another card at the edges
// `join` names, read off one made there for the moment.
function tabLook(box: HTMLElement, join: string | undefined): Keyframe {
  const probe = document.createElement("div");
  probe.className = "card";
  probe.dataset.page = "";
  if (join) probe.dataset.join = join;
  Object.assign(probe.style, { position: "absolute", visibility: "hidden" });
  box.append(probe);
  const look = lookOf(probe);
  probe.remove();
  return look;
}

// The canvas's genie, made the first time it is asked for; null where it
// can't draw one.
function genieOf(canvas: HTMLCanvasElement): Genie | null {
  if (!genies.has(canvas)) genies.set(canvas, Genie.of(canvas));
  return genies.get(canvas) ?? null;
}

// Pops `button` in after `delay` seconds, shown at its start until then.
function popIn(button: HTMLElement, delay: number) {
  const { from, response, damping, fade: fading } = BUTTON;
  button.style.opacity = "";
  const duration = settling(response, undefined, damping);
  const frames = sample(duration, (t) => ({ transform: `scale(${mix(1, from, remaining(t, response, damping))})` }));
  button.animate(frames, { duration: duration * 1000, delay: delay * 1000, easing: "linear", fill: "backwards" });
  button.animate([{ opacity: 0 }, { opacity: 1 }], {
    duration: fading * 1000,
    delay: delay * 1000,
    easing: "linear",
    fill: "backwards"
  });
}

// Fades `part` from `from` to `to` over `duration` seconds, and holds it
// there, unless `hold` is false.
function fade(part: HTMLElement, from: number, to: number, duration: number, hold = true) {
  return part.animate([{ opacity: from }, { opacity: to }], {
    duration: duration * 1000,
    easing: "ease-out",
    fill: hold ? "forwards" : "none"
  }).finished;
}
