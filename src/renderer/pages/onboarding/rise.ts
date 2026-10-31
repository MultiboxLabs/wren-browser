// How onboarding's parts come in.

/** Quick at first, settling slowly. */
export const EASE = [0.22, 1, 0.36, 1] as const;

/** Each part comes in a little after the one before it, the first after `start`. */
export const rise = (order: number, start = 0.1) => ({
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.6, delay: start + order * 0.07, ease: EASE }
});
