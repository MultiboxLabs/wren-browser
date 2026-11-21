// The favicon of the peek in front of a tab, drawn on that tab's row: at
// its right end, or at the top right corner of a favourite's tile. A peek
// has no row of its own while it is open, so this is where it shows in the
// sidebar (src/main/peeks/).

import { Favicon } from "@/components/favicon";
import { usePeekOf, useTab } from "@/state/browser";
import type { TabItem } from "@/state/items";
import { cn } from "@/utils/cn";

/** The favicon of the peek in front of one of `item`'s tabs, if one is; nothing otherwise. */
export function PeekMark({ item, className }: { item: TabItem; className?: string }) {
  const tabs = item.sides.flatMap((side) => (side.tab === null ? [] : [side.tab]));
  const space = item.sides[0].elsewhere;
  const peek = useTab(usePeekOf(tabs, space), space);
  if (!peek) return null;
  return (
    <span
      aria-hidden
      className={cn("pointer-events-none grid size-6 shrink-0 place-items-center rounded-control bg-hover", className)}
    >
      <Favicon url={peek.url} icon={peek.favicon} size={14} />
    </span>
  );
}
