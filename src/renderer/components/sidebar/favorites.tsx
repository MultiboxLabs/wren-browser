// The favourites over the space's tabs: their tiles (favorite.tsx), three to
// a row. While there are none, a box, outlined in dashes, says where they
// go, until its cross puts it away for good (the app's
// `favoritesTipDismissed`).

import { Star, X } from "lucide-react";
import { Button } from "../ui/button";
import type { Pin } from "../../ipc";
import type { LibrarySettings } from "../../state/library";
import { useSpace } from "../../state/space";
import { Favorite } from "./favorite";

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
  selected
}: {
  favorites: Pin[];
  read: boolean;
  settings: LibrarySettings;
  selected?: number;
}) {
  const { profile } = useSpace();
  // An incognito window keeps none.
  const keeps = !profile?.offTheRecord;

  if (favorites.length === 0) {
    const tip = keeps && read && settings.read && !settings.values.favoritesTipDismissed;
    return tip && <FavoritesTip onDismiss={() => settings.update({ favoritesTipDismissed: true })} />;
  }
  return (
    <div className="mt-2 grid shrink-0 grid-cols-3 gap-2">
      {favorites.map((pin) => pin.kind !== "folder" && <Favorite key={pin.id} pin={pin} selected={selected} />)}
    </div>
  );
}

/** The box where the favourites go while there are none. */
function FavoritesTip({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="relative mt-2 flex shrink-0 flex-col items-center gap-1 rounded-favorite border border-dashed border-fg-4 px-6 pt-4 pb-3.5 text-center">
      <span className="mb-1 grid size-6 place-items-center rounded-full bg-fg">
        <Star size={13} strokeWidth={0} fill="currentColor" style={{ color: "var(--space)" }} />
      </span>
      <span className="font-semibold">Drag to add Favourites</span>
      <span className="text-fg-3">Favourites keep your most used sites and apps close</span>
      <Button icon={X} iconSize={15} label="Close" className="no-drag absolute top-1.5 right-1.5" onClick={onDismiss} />
    </div>
  );
}
