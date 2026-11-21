// Springs worked out by hand, for the peek's motion (motion.ts), which plays
// them as Web Animations of their frames or draws them frame by frame. A
// spring is given by how long it takes to get most of the way (its
// response, in seconds) and its damping: 1 settles without overshoot, and
// less overshoots and comes back.

// A spring is done once this much of its way is left.
const SETTLED = 0.001;
// Frames a second a spring's frames are worked out at.
const RATE = 120;

/**
 * How much of its way a spring of `response` and `damping` (1 or less) has
 * left after `t` seconds, from 1 down to 0: none once it has settled, so
 * its last frame is exactly where it rests.
 */
export function remaining(t: number, response: number, damping = 1): number {
  if (t <= 0) return 1;
  if (t >= settling(response, SETTLED, damping)) return 0;
  const w = (2 * Math.PI) / response;
  if (damping >= 1) return (1 + w * t) * Math.exp(-w * t);
  const wd = w * Math.sqrt(1 - damping * damping);
  return Math.exp(-damping * w * t) * (Math.cos(wd * t) + ((damping * w) / wd) * Math.sin(wd * t));
}

/** How long a spring of `response` and `damping` takes to have no more than `left` of its way left, and stay so. */
export function settling(response: number, left = SETTLED, damping = 1): number {
  const w = (2 * Math.PI) / response;
  if (damping < 1) return -Math.log(left) / (damping * w);
  // (1 + x)e^-x = left, solved by Newton's method from past its peak.
  let x = 1 - Math.log(left);
  for (let step = 0; step < 8; step++) {
    const value = (1 + x) * Math.exp(-x) - left;
    x -= value / (-x * Math.exp(-x));
  }
  return x / w;
}

/** `at` worked out over `duration` seconds as evenly spaced frames, at least 60, the last exactly at the end. */
export function sample(duration: number, at: (t: number) => Keyframe): Keyframe[] {
  const count = Math.max(60, Math.ceil(duration * RATE));
  return Array.from({ length: count + 1 }, (_, index) => at((duration * index) / count));
}

export const mix = (from: number, to: number, amount: number) => from + (to - from) * amount;
export const clamp = (value: number, least: number, most: number) => Math.min(most, Math.max(least, value));
export const smoothstep = (amount: number) => amount * amount * (3 - 2 * amount);
