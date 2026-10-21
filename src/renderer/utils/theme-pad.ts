// What the theme picker's colour pad does with a colour: where its knob is,
// what colour a knob is at, and the editor state that holds between them.
//
// A knob is at a point in pad units, -1…1 from the centre with y pointing
// down. Its angle is the colour's hue (red at 3 o'clock, turning clockwise)
// and its distance from the centre its brightness, across a range that
// depends on the appearance. Saturation is not on the pad: it is the one the
// colour had when the picker opened or a preset was chosen.

import type { Hsb, SpaceTheme } from "../ipc";
import { hueOffsets, rotate } from "./theme";

export type Point = { x: number; y: number };

/** What the picker holds besides the theme. */
export type Editor = {
  saturation: number;
  /** The brightness at the pad's centre and at its edge. */
  lo: number;
  hi: number;
};

type Appearance = SpaceTheme["appearance"];

// How far from the centre the edge of the range is, so a knob at full
// brightness is not on the pad's very border.
const EDGE = 0.99;
const LIGHT = [0.575, 0.97] as const;
const DARK = [0.01, 0.425] as const;

const clamp = (value: number, low = 0, high = 1) => Math.min(high, Math.max(low, value));

/** The brightnesses the pad spans, for a colour of brightness `b`. */
function rangeFor(appearance: Appearance, b: number): Pick<Editor, "lo" | "hi"> {
  if (appearance === "auto") return { lo: Math.max(b - 0.25, 0.01), hi: Math.min(b + 0.25, 0.97) };
  const [lo, hi] = appearance === "light" ? LIGHT : DARK;
  // Wide enough for the colour it holds, which a preset may put outside.
  return { lo: Math.min(lo, b), hi: Math.max(hi, b) };
}

/** The editor state for a theme as the picker opens on it. */
export function editorFor({ primary, appearance }: SpaceTheme): Editor {
  return { saturation: Math.max(primary.saturation, 0.01), ...rangeFor(appearance, primary.brightness) };
}

/** Where a colour's knob is. */
export function knobAt({ hue, brightness }: Hsb, { lo, hi }: Editor): Point {
  const radius = hi === lo ? 0 : EDGE * clamp((brightness - lo) / (hi - lo));
  const angle = hue * 2 * Math.PI;
  return { x: radius * Math.cos(angle), y: radius * Math.sin(angle) };
}

/** The colour a knob at `point` stands for. */
function colorAt({ x, y }: Point, { saturation, lo, hi }: Editor): Hsb {
  const turns = Math.atan2(y, x) / (2 * Math.PI);
  return {
    hue: ((turns % 1) + 1) % 1,
    saturation,
    brightness: lo + clamp(Math.hypot(x, y) / EDGE) * (hi - lo)
  };
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

/**
 * The doc in another appearance. Light and dark take the colour to the same
 * place on their own range; automatic keeps the colour, and ranges around it.
 */
export function withAppearance({ theme, editor }: Doc, appearance: Appearance): Doc {
  let { brightness } = theme.primary;
  if (appearance !== "auto") {
    const t = editor.hi === editor.lo ? 0 : clamp((brightness - editor.lo) / (editor.hi - editor.lo));
    const [lo, hi] = appearance === "light" ? LIGHT : DARK;
    brightness = lo + (hi - lo) * t;
  }
  const primary = { ...theme.primary, brightness };
  return {
    theme: { ...theme, appearance, primary },
    editor: { saturation: editor.saturation, ...rangeFor(appearance, brightness) }
  };
}

/** The doc with `color`, a preset, as its primary. */
export function withPrimary({ theme }: Doc, color: Hsb): Doc {
  const next = { ...theme, primary: color };
  return { theme: next, editor: editorFor(next) };
}
