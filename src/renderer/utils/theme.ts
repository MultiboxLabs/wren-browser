// A space's theme, drawn: its colours (the primary, and the others derived
// from it) and the CSS of its layers. The picker's presets are in
// theme-presets.ts. Colours are HSB in Display P3, as the app keeps them
// (`Hsb` in ipc/spaces.ts), or "#rrggbb" whose parts are Display P3's, as
// utils/color.ts has them.

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

/** A colour given as Display P3's red, green and blue, each 0–1, as HSB. */
export function p3ToHsb([r, g, b]: Rgb): Hsb {
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

/**
 * A single-colour theme in `hex`, or black when no colour is given: a theme
 * whose colour hasn't been chosen yet (`isBlank`).
 */
export function defaultTheme(hex?: string): SpaceTheme {
  return {
    primary: p3ToHsb(hex === undefined ? [0, 0, 0] : hexToRgb(hex)),
    colors: 1,
    wheel: "complimentary",
    appearance: "auto",
    intensity: 0.8,
    noise: 0,
    texture: "grain"
  };
}

/**
 * Whether the theme has no colour chosen: it is black, as a new space starts.
 * Black has no hue to put a knob at, so the picker shows its pad without
 * knobs, and the first press there gives a bright colour (utils/theme-pad.ts).
 */
export const isBlank = ({ primary }: SpaceTheme) => primary.brightness < 0.005;

/**
 * The primary colour as the theme is drawn: its own, but white for a blank
 * theme in the light appearance, as black is no light colour. It is still
 * blank, so the picker shows no knobs.
 */
function drawnPrimary(theme: SpaceTheme): Hsb {
  return isBlank(theme) && theme.appearance === "light" ? { hue: 0, saturation: 0, brightness: 1 } : theme.primary;
}

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
  const primary = drawnPrimary(theme);
  return hueOffsets(theme).map((offset) => rotate(primary, offset));
}

/** The theme's primary colour, as "#rrggbb" in Display P3. */
export const primaryHex = (theme: SpaceTheme) => rgbToHex(hsbToRgb(drawnPrimary(theme)));

/**
 * What the theme is drawn on, for the icons and text over it: its appearance,
 * or for an automatic one, whether its primary colour is light.
 */
export function contentScheme({ appearance, primary }: SpaceTheme): "light" | "dark" {
  return appearance === "auto" ? colorScheme(primary) : appearance;
}

/** Whether a colour is light or dark, for what is drawn on it. */
export const colorScheme = (color: Hsb) => schemeFor(rgbToHex(hsbToRgb(color)));

// --- Layers -----------------------------------------------------------------

/** The textures that have artwork so far. */
export const TEXTURES: SpaceTheme["texture"][] = ["grain"];

// How strong each texture is at full noise, which is as much as a window
// should be given: a factor of 0.8 for the grain is far too heavy here. The others have no artwork yet, and are drawn as the grain.
const NOISE_FACTOR = { grain: 0.3, sand: 0.15, denim: 0.25, tweed: 0.2 };
const TEXTURE_IMAGES: Partial<Record<SpaceTheme["texture"], string>> = { grain };

/** The artwork a texture is drawn with. */
export const textureImage = (texture: SpaceTheme["texture"]) => TEXTURE_IMAGES[texture] ?? grain;

// About the flat colour of the window's blur, light or dark as the theme is,
// which the theme is made to be over: its channels, for `rgb()`.
const BLUR = { light: "236 236 236", dark: "30 30 30" };

// How much of its colour a theme shows, of what the colour layer's opacity
// says, so that it is not too vibrant: a little less of a dark theme's, which
// its underlay lifts, and less of a light one's, the window's by a quarter,
// and much less out of use, to be as light as it can. Each is [in use, out of
// use]. The window is over the blur; the floating sidebar is over the page.
const CLARITY = {
  window: { light: [0.75, 0.5], dark: [0.96, 0.96] },
  floating: { light: [0.8, 0.8], dark: [0.96, 0.96] }
};

// What is under the colours, as [in use, out of use]: white over the window's
// blur, thin for a dark theme, as its colour would sink into the dark blur
// otherwise, and more of it out of use, when that blur is flat. Over
// something else (the floating sidebar, which has its own stand-in for the
// blur), black, thin for a dark theme, and heavier for a light one, to be
// darker; a little more of it out of use.
const UNDERLAY = {
  window: { rgb: "255 255 255", light: [0.2, 0.46], dark: [0.18, 0.43] },
  floating: { rgb: "0 0 0", light: [0.2, 0.25], dark: [0.08, 0.14] }
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

/**
 * That line as a CSS gradient's, for a box of `aspect` that lays the theme's
 * first two colours along it: the window's (of `windowAspect`), stretched to
 * fit the box. The gradient's angle, and where on CSS's line through the box
 * the first colour ends and the second is whole.
 */
export function themeLine(aspect: number, windowAspect = aspect) {
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
  /**
   * Drawn as the floating sidebar is, with layers of its own made to be over
   * the page. Without it, the layers are the window's, so that a swatch over
   * a stand-in for the blur shows the colours as the window does.
   */
  floating?: boolean;
};

// What a theme's layers are drawn in, laid out as `layout` says: whether it
// is light or dark, the underlay, and each colour. Each colour is as clear as
// intensity makes it, rather than the layer as a whole: the third, laid over
// the others, adds to them where it shows.
function layerColors(theme: SpaceTheme, { active = true, floating = false }: Pick<ThemeLayout, "active" | "floating">) {
  const scheme = contentScheme(theme);
  const over = floating ? "floating" : "window";
  const which = active ? 0 : 1;
  const alpha = colorAlpha(theme) * CLARITY[over][scheme][which];
  const { rgb, [scheme]: amounts } = UNDERLAY[over];
  return {
    scheme,
    underlay: `rgb(${rgb} / ${amounts[which]})`,
    color: (hsb: Hsb, share = 1) => colorCss(hsb, alpha * share)
  };
}

/** The CSS of the theme's noise, over its colours, multiplied; none without noise. */
export function themeNoise(theme: SpaceTheme): CSSProperties | null {
  return theme.noise > 0
    ? {
        backgroundImage: `url(${textureImage(theme.texture)})`,
        backgroundSize: "128px",
        mixBlendMode: "multiply",
        opacity: theme.noise * NOISE_FACTOR[theme.texture]
      }
    : null;
}

/**
 * The CSS of a theme's layers: an element each, stacked, filling a box laid
 * out as `layout` says.
 */
export function themeStyle(theme: SpaceTheme, layout: ThemeLayout): ThemeStyle {
  const { aspect, window: windowAspect = aspect, material: blur = 0 } = layout;
  const { scheme, underlay, color } = layerColors(theme, layout);
  const material: CSSProperties | null = blur > 0 ? { backgroundColor: `rgb(${BLUR[scheme]})`, opacity: blur } : null;

  const [first, second, third] = derivedColors(theme);
  const colors: CSSProperties = {};
  if (!second) {
    colors.backgroundColor = color(first);
  } else {
    const line = themeLine(aspect, windowAspect);
    const base = `linear-gradient(${line.angle} in oklab, ${color(first)} ${line.first}, ${color(second)} ${line.second})`;
    // The third colour is laid over it from clear at the top to full at the
    // bottom: its own colour, clear, so it never passes through black.
    colors.backgroundImage = third
      ? `linear-gradient(to bottom in oklab, ${color(third, 0)}, ${color(third)}), ${base}`
      : base;
  }

  return { material, underlay: { backgroundColor: underlay }, colors, noise: themeNoise(theme) };
}

/**
 * A theme's layers as colours, laid out as `layout` says, for a box whose
 * colours tween from theme to theme (space-background.tsx): as `themeStyle`
 * draws them, but every theme has every layer, clear where it has none, so
 * that each colour can turn into another theme's. The stand-in for the blur
 * has its opacity as its alpha; one colour is laid along `themeLine` as two
 * of the same; and the third is laid over them from clear at the top to
 * whole at the bottom.
 */
export function themeColors(
  theme: SpaceTheme,
  layout: Pick<ThemeLayout, "active" | "material" | "floating">
): { material: string; underlay: string; first: string; second: string; third: string } {
  const blur = layout.material ?? 0;
  const { scheme, underlay, color } = layerColors(theme, layout);
  const [first, second = first, third] = derivedColors(theme);
  return {
    material: blur > 0 ? `rgb(${BLUR[scheme]} / ${blur})` : "transparent",
    underlay,
    first: color(first),
    second: color(second),
    third: third ? color(third) : "transparent"
  };
}

/**
 * The layers that fill a popover's arrow so that it is of a picker's colour
 * where it meets the picker, a swatch of a window of `windowAspect` (its width
 * over its height): the stand-in for the blur and the underlay, then the
 * colours the gradient has at the middle of the edge the arrow is on (`side`
 * is the popover's side of its trigger: its arrow is on the opposite edge of
 * it).
 */
export function arrowFill(
  theme: SpaceTheme,
  windowAspect: number,
  side: "top" | "right" | "bottom" | "left"
): { color: string; opacity: number }[] {
  const { material, underlay } = themeStyle(theme, { aspect: windowAspect, material: 1 });
  const [first, second, third] = derivedColors(theme).map((color) => colorCss(color));
  // The edge's middle, across and down the picker.
  const [u, v] = { bottom: [0.5, 0], top: [0.5, 1], right: [0, 0.5], left: [1, 0.5] }[side];
  const color = second
    ? `color-mix(in oklab, ${first}, ${second} ${(clamp(share(windowAspect, u, v)) * 100).toFixed(1)}%)`
    : first;
  const alpha = colorAlpha(theme);
  return [
    { color: String(material?.backgroundColor), opacity: 1 },
    { color: String(underlay.backgroundColor), opacity: 1 },
    { color, opacity: alpha },
    // The third colour, laid over the others from clear at the top to whole
    // at the bottom (`themeStyle`): as much of it as there is that far down.
    ...(third ? [{ color: third, opacity: alpha * v }] : [])
  ];
}
