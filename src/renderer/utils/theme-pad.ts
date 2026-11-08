// What the theme picker's colour pad does with a colour: where its knob is,
// what colour a knob is at, and the editor state that holds between them. The
// pad works in HSL, though the theme keeps its colour as HSB.
//
// A knob is at a point in pad units, -1…1 from the centre with y pointing
// down. Its angle is the colour's hue (red at 3 o'clock, turning clockwise)
// and its distance from the centre its lightness, across a range around the
// colour it opened on, darkest at the centre. Saturation is not on the pad.
// It is the one the colour had when the picker opened or a preset was chosen.
// The appearance does not change the colour. It is how the window draws it
// (utils/theme.ts).

import type { Hsb, SpaceTheme } from "@/ipc";
import { hueOffsets, isBlank, rotate } from "./theme";
import type { PresetSwatch } from "./theme-presets";

export type Point = { x: number; y: number };

/** What the picker holds besides the theme. */
export type Editor = {
  /** HSL's. */
  saturation: number;
  /** The lightness at the pad's centre and at its edge. */
  lo: number;
  hi: number;
};

type Appearance = SpaceTheme["appearance"];

// How far from the centre the edge of the range is, so a knob at full
// lightness is not on the pad's very border.
const EDGE = 0.99;

const clamp = (value: number, low = 0, high = 1) => Math.min(high, Math.max(low, value));

// HSB's saturation and brightness as HSL's saturation and lightness, and back.
function toHsl({ saturation, brightness }: Hsb) {
  const lightness = brightness * (1 - saturation / 2);
  const room = Math.min(lightness, 1 - lightness);
  return { saturation: room === 0 ? 0 : (brightness - lightness) / room, lightness };
}
function fromHsl(hue: number, saturation: number, lightness: number): Hsb {
  const brightness = lightness + saturation * Math.min(lightness, 1 - lightness);
  return { hue, saturation: brightness === 0 ? 0 : 2 * (1 - lightness / brightness), brightness };
}

// The pad for a theme with no colour chosen: full saturation, from pure
// colour at the centre out to a pastel at the edge. All of it is at full
// brightness, brighter than any preset.
const VIVID: Editor = { saturation: 1, lo: 0.5, hi: 0.75 };

/**
 * The editor state for a theme as the picker opens on it: the pad spans its
 * lightness, and a quarter either side. A grey keeps a little saturation, so
 * that it can be dragged to a colour. A blank theme gets `VIVID`, so
 * the first press on the pad gives a bright colour.
 */
export function editorFor(theme: SpaceTheme): Editor {
  if (isBlank(theme)) return VIVID;
  const { saturation, lightness } = toHsl(theme.primary);
  return {
    saturation: Math.max(saturation, 0.01),
    lo: Math.max(lightness - 0.25, 0.01),
    hi: Math.min(lightness + 0.25, 0.97)
  };
}

/** Where a colour's knob is. */
export function knobAt(color: Hsb, { lo, hi }: Editor): Point {
  const radius = hi === lo ? 0 : EDGE * clamp((toHsl(color).lightness - lo) / (hi - lo));
  const angle = color.hue * 2 * Math.PI;
  return { x: radius * Math.cos(angle), y: radius * Math.sin(angle) };
}

/** The colour a knob at `point` stands for. */
function colorAt({ x, y }: Point, { saturation, lo, hi }: Editor): Hsb {
  const turns = Math.atan2(y, x) / (2 * Math.PI);
  return fromHsl(((turns % 1) + 1) % 1, saturation, lo + clamp(Math.hypot(x, y) / EDGE) * (hi - lo));
}

/** What the picker edits: the theme, and the state held beside it. */
export type Doc = { theme: SpaceTheme; editor: Editor };

/** The doc with the colour of knob `index` (0 the primary) at `point`: the others follow it. */
export function dragKnob({ theme, editor }: Doc, index: number, point: Point): Doc {
  const color = colorAt(point, editor);
  const offset = hueOffsets(theme)[index] ?? 0;
  return { theme: { ...theme, primary: rotate(color, -offset) }, editor };
}

/** As `dragKnob`, from the knob where it is, turned by `degrees` and moved by `distance` (0–1 of the range). */
export function nudgeKnob(doc: Doc, index: number, degrees: number, distance: number): Doc {
  const { x, y } = knobAt(rotate(doc.theme.primary, hueOffsets(doc.theme)[index] ?? 0), doc.editor);
  const angle = Math.atan2(y, x) + (degrees * Math.PI) / 180;
  const radius = clamp(Math.hypot(x, y) / EDGE + distance) * EDGE;
  return dragKnob(doc, index, { x: radius * Math.cos(angle), y: radius * Math.sin(angle) });
}

/** The doc in another appearance: the colours stay as they are, and only how the window draws them changes. */
export function withAppearance({ theme, editor }: Doc, appearance: Appearance): Doc {
  return { theme: { ...theme, appearance }, editor };
}

/**
 * The doc with `colors` colours, on the wheel it has. Down to one, which has
 * no wheel, it goes back to complimentary, as a second colour then is.
 */
export function withColors({ theme, editor }: Doc, colors: number): Doc {
  return { theme: { ...theme, colors, wheel: colors < 2 ? "complimentary" : theme.wheel }, editor };
}

/**
 * The doc with a preset: its colour as the primary, and as many colours, on
 * its wheel, as it has. The appearance, intensity and noise stay.
 */
export function withPreset({ theme }: Doc, { color, colors, wheel }: PresetSwatch): Doc {
  const next = { ...theme, primary: color, colors, wheel };
  return { theme: next, editor: editorFor(next) };
}
