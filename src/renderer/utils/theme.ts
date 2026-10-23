// A space's theme, drawn: its colours (the primary, and the others derived
// from it), its palettes, and the CSS of its layers. Colours are HSB in
// Display P3, as the app keeps them (`Hsb` in ipc/spaces.ts), or "#rrggbb"
// whose parts are Display P3's, as utils/color.ts has them.

import grain from "../assets/grain.png";
import type { Hsb, SpaceTheme } from "../ipc";
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

/** The theme a new space has, of a colour: one colour, as Arc's default. */
export function defaultTheme(hex: string): SpaceTheme {
  return {
    primary: rgbToHsb(hexToRgb(hex)),
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

export type ThemeStyle = {
  /** Under the colours: white for a light theme, black for a dark one. */
  underlay: CSSProperties;
  /** The colours, each as clear as intensity makes it. */
  colors: CSSProperties;
  /** Over both, multiplied; none without noise. */
  noise: CSSProperties | null;
};

/** How clear the theme's colours are, of its intensity: `0.2 + 0.55 × intensity`. */
const colorAlpha = (theme: SpaceTheme) => 0.55 * theme.intensity + 0.2;

/**
 * The CSS of a theme's layers: an element each, stacked, filling a box of
 * `aspect` (width over height). Arc draws them in a Metal view; the same
 * layers are built here from the same numbers.
 *
 * In a window that is not `active`, the colours are paler, lighter and less
 * of them, as a window in the background fades (the blur behind it is flat
 * then), and the noise is a quarter as strong.
 */
export function themeStyle(theme: SpaceTheme, aspect = 1, active = true): ThemeStyle {
  const alpha = colorAlpha(theme);
  const under = Math.min(alpha, 0.5);
  const underlay: CSSProperties = {
    backgroundColor: contentScheme(theme) === "light" ? `rgb(255 255 255 / ${under})` : `rgb(0 0 0 / ${0.35 * under})`
  };

  // Each colour is as clear as intensity makes it, rather than the layer as a
  // whole: the third, laid over the others, adds to them where it shows.
  const color = (hsb: Hsb, share = 1) => {
    const css = colorCss(hsb, alpha * share);
    return active ? css : `oklch(from ${css} 0.58 calc(c * 0.5) h)`;
  };
  const [first, second, third] = derivedColors(theme);
  const colors: CSSProperties = {};
  if (!second) {
    colors.backgroundColor = color(first);
  } else {
    // Arc's line runs corner to corner of the largest square in the box, and
    // reaches the second colour three quarters along it. CSS's 135° line spans
    // the whole box, (w + h)/√2 long, so the same stops are placed on it.
    const whole = (aspect + 1) / Math.SQRT2;
    const square = Math.min(aspect, 1) * Math.SQRT2;
    const start = (whole - square) / 2 / whole;
    const length = square / whole;
    const stop = (fraction: number) => `${((start + fraction * length) * 100).toFixed(2)}%`;
    const base = `linear-gradient(135deg in oklab, ${color(first)} ${stop(0)}, ${color(second)} ${stop(0.75)})`;
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
          opacity: theme.noise * NOISE_FACTOR[theme.texture] * (active ? 1 : 0.25)
        }
      : null;

  return { underlay, colors, noise };
}

/**
 * The layers that fill a popover's arrow so that it is of a picker's colour
 * where it meets the picker, as `themeStyle` lays them for a box of `aspect`:
 * the underlay, then the colour the gradient has at the middle of the edge the
 * arrow is on (`side` is the popover's side of its trigger: its arrow is on the
 * opposite edge of it).
 */
export function arrowFill(
  theme: SpaceTheme,
  aspect: number,
  side: "top" | "right" | "bottom" | "left"
): { color: string; opacity: number }[] {
  const { underlay } = themeStyle(theme, aspect);
  const [first, second] = derivedColors(theme).map((color) => colorCss(color));
  let color = first;
  if (second) {
    // The edge's middle, in a box of `aspect` by 1, and its place along the gradient's line.
    const [x, y] = { bottom: [aspect / 2, 0], top: [aspect / 2, 1], right: [0, 0.5], left: [aspect, 0.5] }[side];
    const whole = (aspect + 1) / Math.SQRT2;
    const square = Math.min(aspect, 1) * Math.SQRT2;
    const start = (whole - square) / 2 / whole;
    const length = square / whole;
    const along = (x + y) / (aspect + 1);
    const share = Math.min(1, Math.max(0, (along - start) / (0.75 * length)));
    color = `color-mix(in oklab, ${first}, ${second} ${(share * 100).toFixed(1)}%)`;
  }
  return [
    { color: String(underlay.backgroundColor), opacity: 1 },
    { color, opacity: colorAlpha(theme) }
  ];
}
