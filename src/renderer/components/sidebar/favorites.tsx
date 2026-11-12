// The favourites over the space's tabs: their tiles (favorite.tsx), three to
// a row, fewer filling the row between them. While there are none, a box,
// outlined in dashes, says where they go, until its cross puts it away for
// good (the app's `favoritesTipDismissed`); it fades in and out. Their room
// eases to them as they change (`EasedHeight`). What is dropped on either
// lands among them (item-landing.ts); on the box, last, as it lights up.

import { Star, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { type ReactNode, useLayoutEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { LibrarySettings } from "@/state/library";
import type { TabItem } from "@/state/items";
import { useSpace } from "@/state/space";
import { cn } from "@/utils/cn";
import { DropMarkView } from "./drop-mark";
import { Favorite } from "./favorite";
import type { ItemActions } from "./item-actions";
import { useItemDrop } from "./item-drop";
import { gridLandingAt } from "./item-landing";
import { listOrder, REORDER, TILE_IN, TILE_OUT } from "./row-motion";

/**
 * `read`: whether the favourites have been read, before which the box is
 * not shown, so it never flashes up before them; nor before the settings
 * are, which say whether it was put away.
 */
export function Favorites({
  favorites,
  read,
  settings,
  actions
}: {
  favorites: TabItem[];
  read: boolean;
  settings: LibrarySettings;
  actions: ItemActions;
}) {
  const { profile } = useSpace();
  // An incognito window keeps none.
  const keeps = !profile?.offTheRecord;
  const drop = useItemDrop({
    takes: "favorites",
    landingAt: (zone, dragged, x, y) => gridLandingAt(zone, favorites, dragged, x, y),
    enabled: keeps
  });

  const order = listOrder(favorites.map((item) => item.pin ?? -1));

  if (favorites.length === 0) {
    const tip = keeps && read && settings.read && !settings.values.favoritesTipDismissed;
    return (
      <EasedHeight>
        <AnimatePresence initial={false}>
          {tip && (
            <motion.div
              key="tip"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: TILE_IN }}
              exit={{ opacity: 0, transition: TILE_OUT }}
              className="flex shrink-0 flex-col"
            >
              <div {...drop.handlers} className="flex flex-col">
                <FavoritesTip dropping={drop.over} onDismiss={() => settings.update({ favoritesTipDismissed: true })} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </EasedHeight>
    );
  }
  return (
    <EasedHeight>
      <div
        {...drop.handlers}
        className={cn(
          "relative -m-1 mt-1 grid shrink-0 gap-2 rounded-[calc(var(--radius-favorite)+4px)] p-1 transition-colors duration-120",
          drop.over && "bg-hover"
        )}
        style={{ gridTemplateColumns: `repeat(${Math.min(favorites.length, 3)}, minmax(0, 1fr))` }}
      >
        {/* A tile that goes fades where it is, out of the grid at once, so
            the others close up as it does. */}
        <AnimatePresence initial={false} mode="popLayout">
          {favorites.map((item) => (
            <Favorite key={item.pin} item={item} order={order} actions={actions} />
          ))}
        </AnimatePresence>
        {drop.landing?.mark && <DropMarkView mark={drop.landing.mark} />}
      </div>
    </EasedHeight>
  );
}

/**
 * The favourites' room, eased to what is in it as that grows or shrinks (a
 * tile on a new row, the box giving way to the first tile), so the pins and
 * the tabs under it slide rather than jump. What is past its edge as it does
 * is hidden, but for the tiles' glow and shadow just past it.
 */
function EasedHeight({ children }: { children: ReactNode }) {
  const still = useReducedMotion();
  const inner = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | "auto">("auto");
  useLayoutEffect(() => {
    const element = inner.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setHeight(element.offsetHeight));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return (
    <motion.div
      initial={false}
      animate={{ height }}
      transition={still ? { duration: 0 } : REORDER}
      className="shrink-0 overflow-clip [overflow-clip-margin:8px]"
    >
      <div ref={inner} className="flex flex-col">
        {children}
      </div>
    </motion.div>
  );
}

/** The box where the favourites go while there are none, lit up while a drop on it would make one. */
function FavoritesTip({ onDismiss, dropping }: { onDismiss: () => void; dropping: boolean }) {
  return (
    <div
      className={cn(
        "relative mt-2 flex shrink-0 flex-col items-center rounded-favorite border border-dashed border-fg-4 px-5 pt-3 pb-2.5 text-center transition-colors duration-120",
        dropping && "border-fg-3 bg-hover"
      )}
    >
      <Star size={20} strokeWidth={1.75} className="mb-1.5 text-fg-2" />
      <span className="font-semibold">Drag to add Favourites</span>
      <span className="text-caption text-fg-3">Favourites keep your most used sites and apps close</span>
      <Button icon={X} iconSize={13} label="Close" className="no-drag absolute top-1 right-1" onClick={onDismiss} />
    </div>
  );
}
