// The favourites over the space's tabs: their tiles (favorite.tsx), three to
// a row, fewer filling the row between them. While there are none, a box,
// outlined in dashes, says where they go, until its cross puts it away for
// good (the app's `favoritesTipDismissed`). What is dropped on either lands
// among them (pin-landing.ts); on the box, last, as it lights up.

import { Star, X } from "lucide-react";
import { Button } from "../ui/button";
import type { Pin } from "../../ipc";
import type { LibrarySettings } from "../../state/library";
import { useSpace } from "../../state/space";
import { cn } from "../../utils/cn";
import { DropMarkView } from "./drop-mark";
import { Favorite } from "./favorite";
import { usePinDrop } from "./pin-drop";
import type { PinActions } from "./pin-actions";
import { favoritesLandingAt } from "./pin-landing";

/**
 * `read`: whether the favourites have been read, before which the box is
 * not shown, so it never flashes up before them; nor before the settings
 * are, which say whether it was put away. `selected`: the selected tab's ID,
 * unless none is.
 */
export function Favorites({
  favorites,
  read,
  settings,
  selected,
  actions
}: {
  favorites: Pin[];
  read: boolean;
  settings: LibrarySettings;
  selected?: number;
  actions: PinActions;
}) {
  const { profile } = useSpace();
  // An incognito window keeps none.
  const keeps = !profile?.offTheRecord;
  const drop = usePinDrop({
    landingAt: (grid, held, x, y) => favoritesLandingAt(grid, favorites, held, x, y),
    enabled: keeps
  });

  if (favorites.length === 0) {
    const tip = keeps && read && settings.read && !settings.values.favoritesTipDismissed;
    return (
      tip && (
        <div {...drop.handlers} className="flex shrink-0 flex-col">
          <FavoritesTip dropping={drop.over} onDismiss={() => settings.update({ favoritesTipDismissed: true })} />
        </div>
      )
    );
  }
  return (
    <div
      {...drop.handlers}
      className={cn(
        "relative -m-1 mt-1 grid shrink-0 gap-2 rounded-[calc(var(--radius-favorite)+4px)] p-1 transition-colors duration-120",
        drop.over && "bg-hover"
      )}
      style={{ gridTemplateColumns: `repeat(${Math.min(favorites.length, 3)}, minmax(0, 1fr))` }}
    >
      {favorites.map(
        (pin) => pin.kind !== "folder" && <Favorite key={pin.id} pin={pin} selected={selected} actions={actions} />
      )}
      {drop.landing?.mark && <DropMarkView mark={drop.landing.mark} />}
    </div>
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
