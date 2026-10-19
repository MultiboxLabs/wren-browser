// Whether the system asks for Reduced Motion, for what runs outside React
// (a Web Animation started from an event); components use Motion's
// `useReducedMotion`.

export const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * `scale` for a Motion target, left out with Reduced Motion. Motion does not
 * skip a transform's animation then, but makes it at once: an exit's scale
 * would be seen taking its value as the fade starts.
 */
export const scaleTo = (still: boolean | null, scale: number) => (still ? {} : { scale });
