// A favourite: a tile of the grid over the tabs, showing its site's icon, or
// a split's two side by side. Pressed, it opens in place, or selects its
// tab; while its tab is away from its page, a double click takes it back.
// Selected, it has a light fill with a soft shadow, the icon's colours
// glowing faintly through it, and a thin ring of the same colours (see
// .favorite in index.css).

import { type CSSProperties, useId } from "react";
import { Button } from "../ui/button";
import { type Pin, type PinFolder, pins } from "../../ipc";
import { cn } from "../../utils/cn";
import { host } from "../../utils/url";
import { pinDrag } from "./pin-drop";
import { PinPageIcon, pinTitle, usePinTabs } from "./pins";

/** `selected`: the selected tab's ID, unless none is. */
export function Favorite({ pin, selected }: { pin: Exclude<Pin, PinFolder>; selected?: number }) {
  const open = usePinTabs(pin);
  const isSelected = open.some(({ tab }) => tab.id === selected);
  const away = open.findIndex((side) => side.away);
  const pages = pin.kind === "tab" ? [pin.page] : pin.pages;
  const title = pinTitle(pin, open);
  // The ring's filter: Chromium takes an SVG filter only from the page
  // itself, so the tile draws its own, by an ID of its own.
  const filter = `favorite-ring-${useId().replace(/[^\w-]/g, "")}`;
  const icon = (
    <span className="flex gap-1">
      {pages.map((page, side) => (
        <PinPageIcon key={side} page={page} open={open[side]} />
      ))}
    </span>
  );
  return (
    // Dragged out, it is a pin, or an ordinary tab (pin-drop.ts).
    <div {...pinDrag(pin, true)} className="grid">
      <Button
        variant="filled"
        shape="none"
        label={away < 0 ? title : `${title} — Double-click to go back to ${host(pages[away].url)}`}
        pressed={isSelected}
        onPointerDown={(event) => event.button === 0 && pins.open(pin.id)}
        onDoubleClick={() => away >= 0 && pins.back(pin.id, away)}
        className={cn(
          "favorite relative grid h-11.75 place-items-center rounded-favorite",
          isSelected && "favorite-selected"
        )}
      >
        {isSelected && (
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
    </div>
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
