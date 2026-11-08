// The theme picker's preset colours (components/theme-picker/preset-row.tsx):
// five pages of nine. The first page's colours each make a theme of one
// colour. The second has the same colours, each with two more either side of
// it on the analogous wheel. Then come pages of soft colours, deep colours
// and greys. Each colour is given as Display P3's red, green and blue, 0–1.

import type { Hsb, SpaceTheme } from "@/ipc";
import { isBlank, p3ToHsb } from "./theme";

type Rgb = [number, number, number];

const VIVID: Rgb[] = [
  [0.944, 0.919, 0.897],
  [0.901, 0.623, 0.729],
  [0.621, 0.456, 0.606],
  [0.881, 0.407, 0.433],
  [0.938, 0.547, 0.385],
  [0.95, 0.84, 0.428],
  [0.451, 0.897, 0.612],
  [0.496, 0.721, 0.838],
  [0.401, 0.404, 0.527]
];
const VIVID_NAMES = ["Cream", "Pink", "Violet", "Red", "Orange", "Yellow", "Green", "Blue", "Indigo"];

const SOFT: Rgb[] = [
  [0.994, 0.984, 0.981],
  [0.985, 0.917, 0.951],
  [0.924, 0.825, 0.918],
  [0.968, 0.804, 0.822],
  [0.98, 0.882, 0.834],
  [0.996, 0.977, 0.906],
  [0.894, 0.988, 0.926],
  [0.88, 0.95, 0.984],
  [0.774, 0.776, 0.888]
];

const DEEP: Rgb[] = [
  [0.294, 0.231, 0.345],
  [0.384, 0.22, 0.337],
  [0.522, 0.267, 0.267],
  [0.655, 0.439, 0.282],
  [0.82, 0.706, 0.416],
  [0.804, 0.8, 0.659],
  [0.518, 0.659, 0.522],
  [0.204, 0.376, 0.294],
  [0.176, 0.267, 0.408]
];
const DEEP_NAMES = ["Violet", "Plum", "Red", "Rust", "Ochre", "Sand", "Sage", "Forest", "Navy"];

const GREY = [1, 0.9, 0.8, 0.7, 0.5, 0.4, 0.2, 0.1, 0].map((value): Rgb => [value, value, value]);

export type PresetSwatch = {
  label: string;
  color: Hsb;
  /** How many colours choosing it gives the theme, and on which wheel. */
  colors: number;
  wheel: SpaceTheme["wheel"];
};

const page = (rgbs: Rgb[], label: (index: number) => string, colors = 1): PresetSwatch[] =>
  rgbs.map((rgb, index) => ({
    label: label(index),
    color: p3ToHsb(rgb),
    colors,
    wheel: colors > 1 ? "analogous" : "complimentary"
  }));

/** The pages of presets, in order. */
export const PRESET_PAGES: PresetSwatch[][] = [
  page(VIVID, (index) => `Vivid ${VIVID_NAMES[index]}`),
  page(VIVID, (index) => `Blended ${VIVID_NAMES[index]}`, 3),
  page(SOFT, (index) => `Soft ${VIVID_NAMES[index]}`),
  page(DEEP, (index) => `Deep ${DEEP_NAMES[index]}`),
  page(GREY, (index) => `Grey ${index + 1}`)
];

const near = (a: number, b: number) => Math.abs(a - b) < 0.005;

/** Whether the theme has what choosing the preset gives it. */
export function isPreset({ primary, colors, wheel }: SpaceTheme, preset: PresetSwatch) {
  const { color } = preset;
  return (
    colors === preset.colors &&
    (colors === 1 || wheel === preset.wheel) &&
    near(color.brightness, primary.brightness) &&
    near(color.saturation, primary.saturation) &&
    // A grey has no hue to match.
    (color.saturation < 0.01 || near(color.hue, primary.hue))
  );
}

/**
 * The page of presets the theme is on, or the first. A blank theme starts on
 * the first, though black is also the last of the greys.
 */
export function pageOf(theme: SpaceTheme) {
  if (isBlank(theme)) return 0;
  return Math.max(
    PRESET_PAGES.findIndex((swatches) => swatches.some((preset) => isPreset(theme, preset))),
    0
  );
}
