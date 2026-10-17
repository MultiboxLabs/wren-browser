/**
 * Keeps `set` to a value the app keeps: the page asks for it once, and hears
 * it whenever it changes. A change heard before the answer is newer, so the
 * answer is dropped. Returns what stops the listening.
 */
export function follow<T>(
  ask: () => Promise<T>,
  listen: (listener: (value: T) => void) => () => void,
  set: (value: T) => void
) {
  let heard = false;
  const stop = listen((value) => {
    heard = true;
    set(value);
  });
  // Fails while the window has no Browser; the message follows then.
  ask().then(
    (value) => heard || set(value),
    () => {}
  );
  return stop;
}
