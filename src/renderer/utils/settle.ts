// Keeps what the app says again as it was. The app sends a list whole when
// any of it changes, so each item comes as a new object; one that says what
// it said before is kept as the object it was, for React to see it is the
// same and leave what draws it.

/**
 * `next`, with each item whose fields are those of `previous`'s of its ID
 * kept as that item; `previous` itself if no item changed.
 */
export function settle<T extends { id: unknown }>(previous: readonly T[] | undefined, next: T[]): T[] {
  const before = new Map(previous?.map((item) => [item.id, item]));
  let changed = next.length !== previous?.length;
  const settled = next.map((item, index) => {
    const old = before.get(item.id);
    const kept = old && sameFields(old, item) ? old : item;
    if (kept !== previous?.[index]) changed = true;
    return kept;
  });
  return changed ? settled : (previous as T[]);
}

// Each field the same value, compared as `===` does: the fields the app
// sends are strings, numbers, booleans and null.
function sameFields(a: object, b: object) {
  const keys = Object.keys(a);
  return (
    keys.length === Object.keys(b).length &&
    keys.every((key) => (a as Record<string, unknown>)[key] === (b as Record<string, unknown>)[key])
  );
}
