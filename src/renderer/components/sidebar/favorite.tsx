// A favourite: a tile of the grid over the tabs, showing its site's icon, or
// a split's two side by side.
// Selected, it has a light fill with a soft shadow, the icon's colours
// glowing faintly through it, and a thin ring of the same colours (see
// .favorite in index.css).

import { type CSSProperties, useId } from "react";
import { Button } from "../ui/button";
import type { Pin, PinFolder } from "../../ipc";
import { cn } from "../../utils/cn";
import { PinIcon, pinTitle } from "./pins";

export function Favorite({ pin, selected }: { pin: Exclude<Pin, PinFolder>; selected: boolean }) {
  // The ring's filter: Chromium takes an SVG filter only from the page
  // itself, so the tile draws its own, by an ID of its own.
  const filter = `favorite-ring-${useId().replace(/[^\w-]/g, "")}`;
  const icon =
    pin.kind === "tab" ? (
      <PinIcon page={pin.page} />
    ) : (
      <span className="flex gap-1">
        <PinIcon page={pin.pages[0]} />
        <PinIcon page={pin.pages[1]} />
      </span>
    );
  return (
    <Button
      variant="filled"
      shape="none"
      label={pinTitle(pin)}
      pressed={selected}
      className={cn(
        "favorite relative grid h-11.75 place-items-center rounded-favorite",
        selected && "favorite-selected"
      )}
    >
      {selected && (
        <>
          <span aria-hidden className="favorite-glow">
            {icon}
          </span>
          <span
            aria-hidden
            className="favorite-ring"
            style={{ "--favorite-ring-filter": `url(#${filter})` } as CSSProperties}
          >
            <RingFilter id={filter} />
            {icon}
          </span>
        </>
      )}
      <span className="relative grid">{icon}</span>
    </Button>
  );
}

/**
 * The icon blurred as the glow is, then made all but opaque: where the icon
 * has no colour of its own (between the strokes of Gmail's M) the ring takes
 * the nearest, so it goes all the way round without a gap.
 */
function RingFilter({ id }: { id: string }) {
  return (
    <svg width="0" height="0" className="absolute">
      <filter id={id} x="-50%" y="-50%" width="200%" height="200%" colorInterpolationFilters="sRGB">
        <feGaussianBlur stdDeviation="14" />
        <feComponentTransfer>
          <feFuncA type="linear" slope="8" />
        </feComponentTransfer>
      </filter>
    </svg>
  );
}
