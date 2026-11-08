// The curves Wren's motion is eased by, and whether the system asks for
// Reduced Motion, for what runs outside React (a Web Animation started from
// an event); components use Motion's `useReducedMotion`. The curves CSS uses
// are the same, as tokens in index.css.

type Curve = readonly [number, number, number, number];

/** A strong ease-out, for what comes or goes: fast from the start, so the change is seen at once, and settling gently (`--ease-out-strong`). */
export const EASE_OUT = [0.23, 1, 0.32, 1] as const;
/** A gentler ease-out, for a fade away: a strong one would end it in its first frames, and it would seem to vanish rather than go (`--ease-leave`). */
export const EASE_LEAVE = [0, 0, 0.58, 1] as const;
/** For what slides to a new place: most of the way there at once, with a shorter tail than `EASE_OUT`'s, so it looks still sooner. */
export const EASE_SLIDE = [0.25, 1, 0.5, 1] as const;
/** Moving off at once, and settling long and smooth, as a sheet does on iOS. */
export const EASE_DRAWER = [0.32, 0.72, 0, 1] as const;

/** A curve as CSS writes it, for a Web Animation or a style. */
export const cssEase = (curve: Curve) => `cubic-bezier(${curve.join(", ")})`;

export const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * `scale` for a Motion target, left out with Reduced Motion. Motion does not
 * skip a transform's animation then, but makes it at once: an exit's scale
 * would be seen taking its value as the fade starts.
 */
export const scaleTo = (still: boolean | null, scale: number) => (still ? {} : { scale });
