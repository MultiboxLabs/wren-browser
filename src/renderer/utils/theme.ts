// A space's theme, drawn: its colours (the primary, and the others derived
// from it), its palettes, and the CSS of its layers. Colours are HSB in
// Display P3, as the app keeps them (`Hsb` in ipc/spaces.ts), or "#rrggbb"
// whose parts are Display P3's, as utils/color.ts has them.

import grain from "@/assets/grain.png";
import type { Hsb, SpaceTheme } from "@/ipc";
import { schemeFor } from "./color";
import type { CSSProperties } from "react";

type Rgb = [number, number, number];

const clamp = (value: number, low = 0, high = 1) => Math.min(high, Math.max(low, value));

function hexToRgb(hex: string): Rgb {
  const channel = (offset: number) => parseInt(hex.slice(offset, offset + 2), 16) / 255;
  return [channel(1), channel(3), channel(5)];
}

function rgbToHex([r, g, b]: Rgb) {
  const part = (value: number) =>
    Math.round(clamp(value) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${part(r)}${part(g)}${part(b)}`;
}

function rgbToHsb([r, g, b]: Rgb): Hsb {
  const max = Math.max(r, g, b);
  const delta = max - Math.min(r, g, b);
  let sector = 0;
  if (delta > 0) {
    if (max === r) sector = ((((g - b) / delta) % 6) + 6) % 6;
    else if (max === g) sector = (b - r) / delta + 2;
    else sector = (r - g) / delta + 4;
  }
  return { hue: sector / 6, saturation: max === 0 ? 0 : delta / max, brightness: max };
}

function hsbToRgb({ hue, saturation, brightness }: Hsb): Rgb {
  const channel = (offset: number) => {
    const sector = (((hue * 6 + offset) % 6) + 6) % 6;
    return brightness * (1 - saturation * clamp(Math.min(sector, 4 - sector)));
  };
  return [channel(5), channel(3), channel(1)];
}

/** A colour for CSS, in Display P3; `alpha` makes it as clear. */
export function colorCss(color: Hsb, alpha?: number) {
  const [r, g, b] = hsbToRgb(color);
  const clear = alpha === undefined ? "" : ` / ${alpha.toFixed(4)}`;
  return `color(display-p3 ${r.toFixed(4)} ${g.toFixed(4)} ${b.toFixed(4)}${clear})`;
}

/** A single-colour theme, starting on Vivid Indigo unless a colour is given. */
export function defaultTheme(hex?: string): SpaceTheme {
  return {
    primary:
      hex === undefined
        ? PRESET_PAGES[0].swatches.find(({ label }) => label === "Vivid Indigo")!.color
        : rgbToHsb(hexToRgb(hex)),
    colors: 1,
    wheel: "complimentary",
    appearance: "auto",
    intensity: 0.8,
    noise: 0,
    texture: "grain"
  };
}

// --- Palettes ---------------------------------------------------------------

// OKLCH to Display P3, each part 0–1. A colour the gamut doesn't hold keeps
// its lightness and hue and loses chroma, as far as it must.
function oklchToRgb(lightness: number, chroma: number, hue: number): Rgb {
  const at = (c: number) => {
    const a = c * Math.cos((hue * Math.PI) / 180);
    const b = c * Math.sin((hue * Math.PI) / 180);
    const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
    const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
    const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
    // Linear sRGB, then Display P3 (the same transfer curve).
    const r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
    const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
    const bl = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
    return [
      0.8224621 * r + 0.1775379 * g,
      0.0331941 * r + 0.9668058 * g,
      0.0170827 * r + 0.0723974 * g + 0.9105199 * bl
    ] as Rgb;
  };
  const inGamut = (rgb: Rgb) => rgb.every((value) => value >= -0.0005 && value <= 1.0005);
  let low = 0;
  let high = chroma;
  let found = at(chroma);
  if (!inGamut(found)) {
    for (let step = 0; step < 24; step++) {
      const middle = (low + high) / 2;
      if (inGamut(at(middle))) low = middle;
      else high = middle;
    }
    found = at(low);
  }
  const encode = (linear: number) => {
    const value = clamp(linear);
    return value <= 0.0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - 0.055;
  };
  return [encode(found[0]), encode(found[1]), encode(found[2])];
}

/** The nine hues each page has, in order (OKLCH hue, in degrees). */
const PRESET_HUES = [
  { name: "Neutral", hue: 60 },
  { name: "Pink", hue: 350 },
  { name: "Violet", hue: 320 },
  { name: "Red", hue: 22 },
  { name: "Orange", hue: 50 },
  { name: "Yellow", hue: 95 },
  { name: "Green", hue: 150 },
  { name: "Blue", hue: 240 },
  { name: "Indigo", hue: 275 }
] as const;

// Each page's (lightness, chroma) for the nine hues.
const soft: [number, number] = [0.93, 0.045];
const PAGES: { name: string; swatches: [number, number][] }[] = [
  {
    name: "Vivid",
    swatches: [
      [0.95, 0.015],
      [0.78, 0.13],
      [0.62, 0.12],
      [0.66, 0.19],
      [0.75, 0.16],
      [0.88, 0.15],
      [0.82, 0.17],
      [0.74, 0.11],
      [0.5, 0.07]
    ]
  },
  { name: "Soft", swatches: [[0.98, 0.006], soft, soft, soft, soft, soft, soft, soft, soft] },
  {
    name: "Deep",
    swatches: [
      [0.36, 0.02],
      [0.42, 0.1],
      [0.38, 0.1],
      [0.45, 0.13],
      [0.52, 0.12],
      [0.7, 0.11],
      [0.5, 0.1],
      [0.45, 0.1],
      [0.35, 0.1]
    ]
  },
  {
    name: "Grey",
    swatches: [1, 0.92, 0.84, 0.74, 0.62, 0.5, 0.38, 0.26, 0.15].map((lightness) => [lightness, 0] as [number, number])
  }
];

type PresetSwatch = { label: string; color: Hsb };

/** The palettes' swatches, a page after another, for the picker's row. */
export const PRESET_PAGES: { name: string; swatches: PresetSwatch[] }[] = PAGES.map(({ name, swatches }) => ({
  name,
  swatches: swatches.map(([lightness, chroma], index) => {
    const { name: hueName, hue } = PRESET_HUES[index];
    // Grey's nine are not hues.
    const label = name === "Grey" ? `Grey ${index + 1}` : `${name} ${hueName}`;
    return { label, color: rgbToHsb(oklchToRgb(lightness, chroma, hue)) };
  })
}));

// --- Colours ----------------------------------------------------------------

export const rotate = (color: Hsb, degrees: number): Hsb => ({
  ...color,
  hue: (((color.hue + degrees / 360) % 1) + 1) % 1
});

/** How far each of the theme's colours has its hue turned from the primary's, in degrees. */
export function hueOffsets({ colors, wheel }: Pick<SpaceTheme, "colors" | "wheel">): number[] {
  const complimentary = wheel === "complimentary";
  if (colors === 2) return [0, complimentary ? 180 : 40];
  if (colors === 3) return complimentary ? [0, 150, 210] : [0, 40, -40];
  return [0];
}

/** The theme's colours, as many as it has: the primary, then the others derived from it. */
export function derivedColors(theme: SpaceTheme): Hsb[] {
  return hueOffsets(theme).map((offset) => rotate(theme.primary, offset));
}

/** The theme's primary colour, as "#rrggbb" in Display P3. */
export const primaryHex = (theme: SpaceTheme) => rgbToHex(hsbToRgb(theme.primary));

/**
 * What the theme is drawn on, for the icons and text over it: its appearance,
 * or for an automatic one, whether its primary colour is light.
 */
export function contentScheme({ appearance, primary }: SpaceTheme): "light" | "dark" {
  return appearance === "auto" ? schemeFor(rgbToHex(hsbToRgb(primary))) : appearance;
}

// --- Layers -----------------------------------------------------------------

/** The textures that have artwork so far. */
export const TEXTURES: SpaceTheme["texture"][] = ["grain"];

// How strong each texture is at full noise, which is as much as a window
// should be given: Arc's own factors (0.8 for the grain) are far too heavy
// here. The others have no artwork yet, and are drawn as the grain.
const NOISE_FACTOR = { grain: 0.3, sand: 0.15, denim: 0.25, tweed: 0.2 };
const TEXTURE_IMAGES: Partial<Record<SpaceTheme["texture"], string>> = { grain };

// About the flat colour of the window's blur, light or dark as the theme is,
// which the theme is made to be over.
const BLUR = { light: "rgb(236 236 236)", dark: "rgb(30 30 30)" };

// How much of its colour a theme shows, of what the colour layer's opacity
// says, so that it is not too vibrant: a little less of a dark theme's, which
// its underlay lifts, and less of a light one's, the window's by a quarter,
// and much less out of use, to be as light as it can. Each is [in use, out of
// use]. The window is over the blur; a box is over something else (the
// floating sidebar).
const CLARITY = {
  window: { light: [0.75, 0.5], dark: [0.96, 0.96] },
  box: { light: [0.8, 0.8], dark: [0.96, 0.96] }
};

// What is under the colours, as [in use, out of use]: white over the window's
// blur, thin for a dark theme, as its colour would sink into the dark blur
// otherwise, and much more of it out of use, when that blur is flat. Over
// something else (the floating sidebar, which has its own stand-in for the
// blur), black, thin for a dark theme, and heavier for a light one, to be
// darker; a little more of it out of use.
const UNDERLAY = {
  window: { rgb: "255 255 255", light: [0.2, 1], dark: [0.18, 0.8] },
  box: { rgb: "0 0 0", light: [0.2, 0.25], dark: [0.08, 0.14] }
};

export type ThemeStyle = {
  /** Under everything, over something other than the window's blur: a stand-in for it. */
  material: CSSProperties | null;
  /** Under the colours: white, or over something else (the floating sidebar) black. More of it out of use. */
  underlay: CSSProperties;
  /** The colours, each as clear as intensity makes it. */
  colors: CSSProperties;
  /** Over both, multiplied; none without noise. */
  noise: CSSProperties | null;
};

/** How clear the theme's colours are, of its intensity: `0.2 + 0.55 × intensity`. */
const colorAlpha = (theme: SpaceTheme) => 0.55 * theme.intensity + 0.2;

// How much of the second colour a point of the window has over its first:
// 0 at the start of their line, 1 three quarters along it, and on, unclamped.
// The line runs corner to corner of the largest square in the middle of the
// window, which is `windowAspect` wide over its height; the point is `u`
// across it and `v` down it, each 0–1.
function share(windowAspect: number, u: number, v: number) {
  const square = Math.min(windowAspect, 1);
  return (windowAspect * u + v - (windowAspect + 1) / 2 + square) / (2 * square) / 0.75;
}

// That line as a CSS gradient's, for a box of `aspect` that draws the
// window's gradient stretched to fit it: the gradient's angle, and where on
// CSS's line through the box the first colour ends and the second is whole.
function baseLine(aspect: number, windowAspect: number) {
  // Stretched, the line runs (windowAspect / aspect, 1) in the box, down
  // being y. CSS's angle is clockwise from up, and its line spans the box.
  const angle = Math.atan2(windowAspect / aspect, -1);
  const [x, y] = [Math.sin(angle), -Math.cos(angle)];
  const length = aspect * Math.abs(x) + Math.abs(y);
  // The share at a fraction of CSS's line, which runs through the box's middle.
  const at = (fraction: number) => {
    const offset = (fraction - 0.5) * length;
    return share(windowAspect, 0.5 + (offset * x) / aspect, 0.5 + offset * y);
  };
  const [from, to] = [at(0), at(1)];
  const stop = (value: number) => `${(((value - from) / (to - from)) * 100).toFixed(2)}%`;
  return { angle: `${((angle * 180) / Math.PI).toFixed(2)}deg`, first: stop(0), second: stop(1) };
}

export type ThemeLayout = {
  /** The box's width over its height. */
  aspect: number;
  /**
   * The window's, whose gradient the box draws stretched to fit it, so that
   * a swatch of any shape is the window in small: as `aspect` if not given,
   * for the window itself.
   */
  window?: number;
  /**
   * Whether the window is in use. Out of use, as a window in the background
   * fades (the blur behind it is flat then), there is more underlay.
   */
  active?: boolean;
  /**
   * How much a stand-in for the window's blur shows under the theme, 0–1,
   * for a box over something else (the page, a popover), which would show
   * through the theme: none for the window itself, which is over the blur.
   */
  material?: number;
};

/**
 * The CSS of a theme's layers: an element each, stacked, filling a box laid
 * out as `layout` says.
 */
export function themeStyle(
  theme: SpaceTheme,
  { aspect, window: windowAspect = aspect, active = true, material: blur = 0 }: ThemeLayout
): ThemeStyle {
  const scheme = contentScheme(theme);
  const material: CSSProperties | null = blur > 0 ? { backgroundColor: BLUR[scheme], opacity: blur } : null;
  const over = blur > 0 ? "box" : "window";
  const which = active ? 0 : 1;
  const alpha = colorAlpha(theme) * CLARITY[over][scheme][which];
  const { rgb, [scheme]: amounts } = UNDERLAY[over];
  const underlay: CSSProperties = { backgroundColor: `rgb(${rgb} / ${amounts[which]})` };

  // Each colour is as clear as intensity makes it, rather than the layer as a
  // whole: the third, laid over the others, adds to them where it shows.
  const color = (hsb: Hsb, share = 1) => colorCss(hsb, alpha * share);
  const [first, second, third] = derivedColors(theme);
  const colors: CSSProperties = {};
  if (!second) {
    colors.backgroundColor = color(first);
  } else {
    const line = baseLine(aspect, windowAspect);
    const base = `linear-gradient(${line.angle} in oklab, ${color(first)} ${line.first}, ${color(second)} ${line.second})`;
    // The third colour is laid over it from clear at the top to full at the
    // bottom: its own colour, clear, so it never passes through black.
    colors.backgroundImage = third
      ? `linear-gradient(to bottom in oklab, ${color(third, 0)}, ${color(third)}), ${base}`
      : base;
  }

  const noise: CSSProperties | null =
    theme.noise > 0
      ? {
          backgroundImage: `url(${TEXTURE_IMAGES[theme.texture] ?? grain})`,
          backgroundSize: "128px",
          mixBlendMode: "multiply",
          opacity: theme.noise * NOISE_FACTOR[theme.texture]
        }
      : null;

  return { material, underlay, colors, noise };
}

/**
 * The layers that fill a popover's arrow so that it is of a picker's colour
 * where it meets the picker, a swatch of a window of `windowAspect` (its width
 * over its height): the stand-in for the blur and the underlay, then the
 * colour the gradient has at the middle of the edge the arrow is on (`side`
 * is the popover's side of its trigger: its arrow is on the opposite edge of
 * it).
 */
export function arrowFill(
  theme: SpaceTheme,
  windowAspect: number,
  side: "top" | "right" | "bottom" | "left"
): { color: string; opacity: number }[] {
  const { material, underlay } = themeStyle(theme, { aspect: windowAspect, material: 1 });
  const [first, second] = derivedColors(theme).map((color) => colorCss(color));
  let color = first;
  if (second) {
    // The edge's middle, across and down the picker.
    const [u, v] = { bottom: [0.5, 0], top: [0.5, 1], right: [0, 0.5], left: [1, 0.5] }[side];
    color = `color-mix(in oklab, ${first}, ${second} ${(clamp(share(windowAspect, u, v)) * 100).toFixed(1)}%)`;
  }
  return [
    { color: String(material?.backgroundColor), opacity: 1 },
    { color: String(underlay.backgroundColor), opacity: 1 },
    { color, opacity: colorAlpha(theme) }
  ];
}
