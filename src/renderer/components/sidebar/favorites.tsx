// The favourites over the space's tabs: their tiles (favorite.tsx), three to
// a row.

import type { Pin } from "../../ipc";
import { Favorite } from "./favorite";

/** `selected`: the selected tab's ID, unless none is. */
export function Favorites({ favorites, selected }: { favorites: Pin[]; selected?: number }) {
  if (favorites.length === 0) return null;
  return (
    <div className="mt-2 grid shrink-0 grid-cols-3 gap-2">
      {favorites.map((pin) => pin.kind !== "folder" && <Favorite key={pin.id} pin={pin} selected={selected} />)}
    </div>
  );
}
