// What is marked in the sidebar, to be dragged, closed or kept together:
// tabs of a list, or pinned tabs, never both. Each is held by an ID
// (`markIds` in items.ts): a tab of a list by its Chromium tab, and a
// pinned tab by its pin. A row hears only as its own are marked or no
// longer are (`subscribe`), so marking a row draws that row alone.
//
// Which rows act together, and what a press marks, is the sidebar's
// (components/sidebar/marking.ts), which knows the rows it draws.

export class Marks {
  private marked = new Set<string>();
  // What draws a row marked, by the IDs it is held by.
  private listeners = new Map<string, Set<() => void>>();

  has = (id: string) => this.marked.has(id);

  /** Whether anything is marked. */
  get any() {
    return this.marked.size > 0;
  }

  /** Hears as any of `ids` is marked, or no longer is. */
  subscribe = (ids: readonly string[], listener: () => void) => {
    for (const id of ids) {
      let listeners = this.listeners.get(id);
      if (!listeners) this.listeners.set(id, (listeners = new Set()));
      listeners.add(listener);
    }
    return () => {
      for (const id of ids) {
        const listeners = this.listeners.get(id);
        listeners?.delete(listener);
        if (listeners && !listeners.size) this.listeners.delete(id);
      }
    };
  };

  /** Marks `ids`, and nothing else. */
  set(ids: Iterable<string>) {
    const next = new Set(ids);
    const changed = [...this.marked, ...next].filter((id) => this.marked.has(id) !== next.has(id));
    this.marked = next;
    for (const id of new Set(changed)) this.listeners.get(id)?.forEach((listener) => listener());
  }

  /** Marks a row, by its `ids`, or, if it is marked, no longer. */
  toggle(ids: readonly string[]) {
    const rest = [...this.marked].filter((id) => !ids.includes(id));
    this.set(ids.every(this.has) ? rest : [...rest, ...ids]);
  }

  /** Leaves marked only what is among `ids`: the rest has gone from where it could be marked. */
  keep(ids: ReadonlySet<string>) {
    const kept = [...this.marked].filter((id) => ids.has(id));
    if (kept.length < this.marked.size) this.set(kept);
  }

  clear() {
    if (this.any) this.set([]);
  }
}
