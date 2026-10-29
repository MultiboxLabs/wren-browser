// A favourite: a tile of the grid over the tabs, showing its site's icon, or
// a split's two, each in the middle of its half, a gap between them.
// Pressed, it opens in place, or selects its tab; while its tab is away
// from its page, a double click takes it back.
// A right click shows its menu, and it is renamed in a popover hanging off
// it (pin-actions.tsx): Return or a click elsewhere keeps the name, and
// Escape leaves it as it was.
// Selected, it has a light fill with a soft shadow, the icon's colours
// glowing faintly through it, and a thin ring of the same colours, which
// fills the gap between a split's halves (see .favorite in index.css).

import { motion, useReducedMotion } from "motion/react";
import { type CSSProperties, type Ref, useId, useRef } from "react";
import { Button } from "../ui/button";
import { Popover } from "../ui/popover";
import { TextField } from "../ui/text-field";
import { type Pin, type PinFolder, pins } from "../../ipc";
import { cn } from "../../utils/cn";
import { scaleTo } from "../../utils/motion";
import { host } from "../../utils/url";
import { useArrival, useMoving } from "./arrival";
import type { PinActions } from "./pin-actions";
import { REORDER, TILE_IN, TILE_OUT } from "./row-motion";
import { pinDrag } from "./pin-drop";
import { identitiesOf, PinPageIcon, pinTitle, usePinTabs } from "./pins";

/**
 * `selected`: the selected tab's ID, unless none is. `ref` is its tile's, as
 * the grid takes a tile that goes out of its layout (`popLayout`).
 */
export function Favorite({
  pin,
  selected,
  actions,
  ref
}: {
  pin: Exclude<Pin, PinFolder>;
  selected?: number;
  actions: PinActions;
  ref?: Ref<HTMLDivElement>;
}) {
  const open = usePinTabs(pin);
  const isSelected = open.some(({ tab }) => tab.id === selected);
  const away = open.findIndex((side) => side.away);
  const pages = pin.kind === "tab" ? [pin.page] : pin.pages;
  const title = pinTitle(pin, open);
  // The ring's filter: Chromium takes an SVG filter only from the page
  // itself, so the tile draws its own, by an ID of its own.
  const filter = `favorite-ring-${useId().replace(/[^\w-]/g, "")}`;
  const split = pages.length > 1;
  const icons = pages.map((page, side) => <PinPageIcon key={side} page={page} open={open[side]} />);
  // The glow's and the ring's, blurred over the whole tile: the icons fill
  // the box that is stretched over it, a split's two side by side, so their
  // colours reach every edge.
  const filling = <span className="flex *:min-w-0 *:flex-1 *:size-full!">{icons}</span>;
  const renaming = actions.renaming === pin.id;
  // It slides here from where it, or its tab, was drawn (arrival.ts).
  const identities = identitiesOf(pin, open);
  const arrival = useArrival<HTMLDivElement>(identities);
  const moving = useMoving(identities);
  const still = useReducedMotion();
  const tile = (
    // Dragged out, it is a pin, or an ordinary tab (pin-drop.ts).
    <div ref={arrival} {...pinDrag(pin, { favorite: true, renaming })} className="grid">
      <Button
        variant="filled"
        shape="none"
        label={away < 0 ? title : `${title} — Double-click to go back to ${host(pages[away].url)}`}
        pressed={isSelected}
        onPointerDown={(event) => event.button === 0 && pins.open(pin.id)}
        onDoubleClick={() => away >= 0 && pins.back(pin.id, away)}
        onContextMenu={(event) => {
          event.preventDefault();
          actions.onMenu(pin, event.clientX, event.clientY);
        }}
        className={cn(
          "favorite relative grid h-11.75 place-items-center rounded-favorite",
          isSelected && "favorite-selected",
          split && "favorite-split"
        )}
      >
        {isSelected && (
          <>
            <span aria-hidden className="favorite-glow">
              {filling}
            </span>
            <span
              aria-hidden
              className="favorite-ring"
              style={{ "--favorite-ring-filter": `url(#${filter})` } as CSSProperties}
            >
              <RingFilter id={filter} />
              {filling}
            </span>
          </>
        )}
        <span className={cn("grid place-items-center", split ? "absolute inset-0 grid-cols-2" : "relative")}>
          {icons}
        </span>
      </Button>
    </div>
  );
  // The name as it is edited, once it is: a click elsewhere, which closes
  // the popover, keeps it, and Escape leaves it.
  const draft = useRef<string | null>(null);
  const keep = (name: string | null) => {
    draft.current = null;
    actions.onRename(pin, name === title ? null : name);
  };
  return (
    // Comes and goes as the list's rows do, scaling up a little as it fades
    // in; one moving here from elsewhere slides here whole instead. One that
    // changes place in the grid, as another comes, goes or moves, slides
    // there: there are few enough for Motion to measure each time.
    <motion.div
      ref={ref}
      layout={still ? undefined : "position"}
      initial={moving ? false : { opacity: 0, ...scaleTo(still, 0.95) }}
      animate={{ opacity: 1, ...scaleTo(still, 1), transition: TILE_IN }}
      exit={{ opacity: 0, transition: TILE_OUT }}
      transition={{ layout: REORDER }}
      className="grid"
    >
      <Popover
        anchored
        open={renaming}
        onOpenChange={(open) => !open && keep(draft.current)}
        onEscape={() => (draft.current = null)}
        label="Rename Favourite"
        trigger={tile}
      >
        {renaming && (
          <form
            className="p-2.5"
            onSubmit={(event) => {
              event.preventDefault();
              keep(draft.current);
            }}
          >
            <TextField
              autoFocus
              defaultValue={title}
              aria-label="Favourite Name"
              onChange={(event) => (draft.current = event.currentTarget.value)}
              onFocus={(event) => event.currentTarget.select()}
              className="w-52"
            />
          </form>
        )}
      </Popover>
    </motion.div>
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
