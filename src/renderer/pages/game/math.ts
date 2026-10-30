// Small helpers the game's logic and drawing share.

export const TAU = Math.PI * 2;

export const random = (min: number, max: number) => min + Math.random() * (max - min);
export const chance = (probability: number) => Math.random() < probability;
export const pick = <T>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)];
export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
export const lerp = (from: number, to: number, t: number) => from + (to - from) * t;
export const smoothstep = (t: number) => t * t * (3 - 2 * t);

// Moves `current` toward `target` by the same share each second, however the
// frames fall: `rate` is how quickly, about 1 / the seconds it takes.
export const approach = (current: number, target: number, rate: number, dt: number) =>
  target + (current - target) * Math.exp(-rate * dt);

export const distance = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);

// A smooth, repeatable wobble in -1..1, for what should move without
// looking random: grass, branches, a butterfly's path.
export const wobble = (t: number, seed: number) =>
  (Math.sin(t * 1.3 + seed * 7.1) + Math.sin(t * 2.1 + seed * 3.7) * 0.6 + Math.sin(t * 0.7 + seed)) / 2.6;

// A number in 0..1 that is always the same for the same `seed`, for scenery
// that must not change between frames.
export const hash = (seed: number) => {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

// A colour as its red, green and blue, each 0..255, so it can be mixed.
export type Rgb = readonly [number, number, number];

export const rgb = (hex: string): Rgb => {
  const value = parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
};

export const mixRgb = (from: Rgb, to: Rgb, t: number): Rgb => [
  lerp(from[0], to[0], t),
  lerp(from[1], to[1], t),
  lerp(from[2], to[2], t)
];

// A colour for the canvas, at `opacity`.
export const css = ([r, g, b]: Rgb, opacity = 1) =>
  `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${opacity})`;

// A #rrggbb colour at `opacity`.
export const fade = (hex: string, opacity: number) => css(rgb(hex), opacity);
