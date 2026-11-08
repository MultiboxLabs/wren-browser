// The sidebar: the toolbar beside the window's buttons, the address, the
// favourites, and the space's tabs (tab-list.tsx); or, while the window is
// on no space, the form for a new one (new-space.tsx). At the bottom, a new
// version of Wren, if there is one (update.tsx).

import { Archive, Plus } from "lucide-react";
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useTransform
} from "motion/react";
import { type RefObject, useLayoutEffect, useRef, useState } from "react";
import { browser } from "@/ipc";
import { Button } from "@/components/ui/button";
import { AddressField } from "@/components/address/field";
import { BackIcon, ForwardIcon, ReloadIcon, SidebarIcon, StopIcon } from "@/components/icons";
import type { OmniboxState } from "@/components/omnibox/shown";
import { cn } from "@/utils/cn";
import { scaleTo } from "@/utils/motion";
import { DownloadFlights } from "@/components/downloads/flight";
import { Indicator } from "@/components/downloads/indicator";
import { Shelf, useShelf } from "@/components/downloads/shelf";
import { ArrivalScope } from "./arrival";
import { Favorites } from "./favorites";
import { usePinActions } from "./pin-actions";
import { NewSpaceForm } from "./new-space";
import { SpaceColours } from "./space-colours";
import { useSpaceSwipe } from "./space-swipe";
import { SpaceSwitcher } from "./space-switcher";
import { ListBelowContext } from "./list-edge";
import { TabList } from "./tab-list";
import { UpdateCard } from "./update";
import { BrowserOfSpace, useBrowser } from "@/state/browser";
import { useDownloadIndicator } from "@/state/downloads";
import { type LibrarySettings, useSettings } from "@/state/library";
import { usePins } from "@/state/pins";
import { useDrawnSpace, useSpace } from "@/state/space";
import { SLIDE } from "@/state/space-slide";

export type SidebarProps = {
  /** Docked beside the page: its button hides it, rather than keeps it. */
  open: boolean;
  onToggle: () => void;
  /** The omnibox, which the address and the New Tab row open. */
  omnibox: OmniboxState;
  /** For the address field, whose box the omnibox for the active tab opens over. */
  address: RefObject<HTMLDivElement | null>;
  onOpenLibrary: () => void;
  /** It is out, and not the Library in its place: the downloads' shelf may show by itself. */
  visible: boolean;
};

// Stop's cross grows in where reload's icon was, which goes at once, and
// shrinks away before reload's comes back; one is shown at a time.
const stopMotion = (still: boolean | null) => ({
  initial: { opacity: 0, ...scaleTo(still, 0.8) },
  animate: { opacity: 1, ...scaleTo(still, 1) },
  exit: { opacity: 0, ...scaleTo(still, 0.8) },
  transition: { duration: 0.2 }
});

const shortcut = (key: string) => (document.documentElement.dataset.platform === "mac" ? `⌘${key}` : `Ctrl+${key}`);

/** Reload, which turns into stop while the active tab loads. */
function ReloadButton({ loading, onReload, onStop }: { loading: boolean; onReload: () => void; onStop: () => void }) {
  const still = useReducedMotion();
  return (
    <Button
      icon={
        <AnimatePresence mode="wait" initial={false}>
          {loading ? (
            <motion.span key="stop" className="grid" {...stopMotion(still)}>
              <StopIcon size={15} />
            </motion.span>
          ) : (
            <span key="reload" className="grid">
              <ReloadIcon size={15} />
            </span>
          )}
        </AnimatePresence>
      }
      label={loading ? "Stop" : "Reload"}
      onClick={loading ? onStop : onReload}
    />
  );
}

/**
 * The space `id`, a render after it changes: once the window has put the
 * space's look on the page (useWindowTheme, around the sidebar, in a layout
 * effect too), and still before it paints. What mounts for the space then
 * starts in its colours, rather than tweening from the last space's.
 */
function useThemedSpace(id: number) {
  const [themed, setThemed] = useState(id);
  useLayoutEffect(() => setThemed(id), [id]);
  return themed;
}

export function Sidebar({ open, onToggle, omnibox, address, onOpenLibrary, visible }: SidebarProps) {
  const { space, spaces, profile, newSpace, startNewSpace, showNow, slide } = useSpace();
  // A swipe across the sidebar goes to the next space or the previous one;
  // the space being made is after the last.
  const area = useRef<HTMLDivElement>(null);
  const at = newSpace ? spaces.length : spaces.findIndex(({ id }) => id === space.id);
  const neighbour = (by: 1 | -1) => (at < 0 ? undefined : spaces[at + by]);
  useSpaceSwipe(
    area,
    slide,
    (by) => neighbour(by) !== undefined,
    (by) => {
      const next = neighbour(by);
      if (next) showNow(next.id);
    }
  );
  const swipe = slide.x;
  // The content fades as it slides away.
  const fade = useTransform(swipe, (x) => 1 - Math.min(Math.abs(x) / SLIDE, 1) * 0.85);
  const themed = useThemedSpace(space.id);
  const { current: active } = useBrowser();
  // Read once for every space's content, not again as each comes in.
  const settings = useSettings(true);
  const indicator = useDownloadIndicator();
  // The latest downloads, over the bottom of the content, which fades out under them.
  const shelf = useShelf(visible && !newSpace);
  // How far the update's card reaches up over the content as it opens; the
  // content is cut off there, as the shelf fades it.
  const update = useMotionValue(0);
  const mask = useTransform(() => {
    const height = update.get();
    const layers = [
      shelf.mask.get(),
      height > 0 ? `linear-gradient(black calc(100% - ${height}px), transparent 0)` : "none"
    ];
    return layers.filter((layer) => layer !== "none").join(", ") || "none";
  });
  // Where the list is cut off, a hairline, while any of it goes on below:
  // at its bottom edge, or where the card reaches. Edge to edge: past the
  // content's padding on the left, and on the right, the floating sidebar's
  // padding or, docked, the gap to the page, as wide; but inside the
  // floating sidebar's 1px edge (`.peek`), which it would otherwise cross.
  const below = useMotionValue(0);
  const edge = useTransform(update, (height) => -height);
  const [cutOff, setCutOff] = useState(false);
  useMotionValueEvent(
    useTransform(() => below.get() + update.get() > 1),
    "change",
    setCutOff
  );
  // Where a download that starts flies to.
  const library = useRef<HTMLDivElement>(null);

  return (
    <div ref={area} className="relative flex h-full flex-col">
      <div className="flex h-10 shrink-0 items-center">
        <div className="w-[calc(var(--window-buttons)-8px)] shrink-0" />
        <Button
          icon={SidebarIcon}
          label={`${open ? "Hide" : "Keep"} Sidebar (${shortcut("S")})`}
          iconSize={19}
          className="ml-1.75"
          onClick={onToggle}
        />
        <div className="flex-1" />
        <div className="flex gap-1.5">
          <Button
            icon={BackIcon}
            label="Back"
            iconSize={17}
            disabled={!active?.canGoBack}
            onClick={() => browser.back()}
          />
          <Button
            icon={ForwardIcon}
            label="Forward"
            iconSize={17}
            disabled={!active?.canGoForward}
            onClick={() => browser.forward()}
          />
          <ReloadButton
            loading={active?.loading ?? false}
            onReload={() => browser.reload()}
            onStop={() => browser.stop()}
          />
        </div>
      </div>

      {/* What slides with a swipe: the space's, below the toolbar. It is
          clipped at the sidebar's sides, with room for the rows' outlines.
          While a space is made, below the toolbar is the form's, not a
          handle for the window: a press that misses a field is no drag. */}
      <motion.div
        style={{ maskImage: mask, maskComposite: "intersect" }}
        className={cn("-mx-2 flex min-h-0 flex-1 flex-col overflow-x-clip px-2", newSpace && "no-drag")}
      >
        <motion.div style={{ x: swipe, opacity: fade }} className="flex min-h-0 flex-1 flex-col">
          {newSpace ? (
            <NewSpaceForm state={newSpace} />
          ) : (
            themed === space.id && (
              // Each space's own, so one's tabs never leave or arrive in another's.
              <SpaceColours key={space.id} space={space}>
                <BrowserOfSpace space={space.id}>
                  <ListBelowContext value={below}>
                    <SpaceContent omnibox={omnibox} address={address} settings={settings} />
                  </ListBelowContext>
                </BrowserOfSpace>
              </SpaceColours>
            )
          )}
        </motion.div>
      </motion.div>

      {/* Above the buttons: the update, if there is one, and the shelf over
          the bottom of the content, above it; over them, where the list is
          cut off, its hairline. */}
      <div className="relative shrink-0">
        <motion.div
          style={{ y: edge }}
          className={cn(
            "pointer-events-none absolute -inset-x-[7px] top-0 h-px bg-(--list-edge) transition-opacity duration-150",
            cutOff ? "opacity-100" : "opacity-0"
          )}
        />
        <Shelf shelf={shelf} />
        {!newSpace && <UpdateCard cover={update} />}
      </div>

      {/* While a space is made, only the switcher: the form is left by its own
          buttons, or by another space. */}
      <div className={cn("flex h-12.5 shrink-0 items-center", newSpace && "no-drag")}>
        {!newSpace && (
          <div ref={library} className="relative shrink-0" {...shelf.button}>
            <Button
              icon={Archive}
              label="Library"
              onClick={() => {
                shelf.hide();
                onOpenLibrary();
              }}
            />
            <Indicator indicator={indicator} />
            <DownloadFlights target={library} />
          </div>
        )}
        <div className="flex min-w-0 flex-1 justify-center px-1">
          <SpaceSwitcher />
        </div>
        {/* A window on a profile never switches, so makes no space. */}
        {!profile && !newSpace && <Button icon={Plus} label="New Space" onClick={() => startNewSpace()} />}
      </div>
    </div>
  );
}

type SpaceContentProps = Pick<SidebarProps, "omnibox" | "address"> & { settings: LibrarySettings };

/** What the sidebar shows of the space, below its toolbar: the address, the favourites, the pins and the tabs. */
function SpaceContent({ omnibox, address, settings }: SpaceContentProps) {
  const { profile } = useSpace();
  const space = useDrawnSpace();
  const { current, ready } = useBrowser();
  // A window on a profile shows its favourites; a made-up space has none.
  const pins = usePins(profile ? null : space.id > 0 ? space.id : undefined);
  const { actions, dialog } = usePinActions(pins.toggleFolder);
  // The tab drawn selected, as a pin's or a favourite's too; none while the
  // omnibox for a new tab is open.
  const selected = omnibox.shown?.target === "new-tab" ? undefined : current?.id;
  // The space's pins and the settings are mostly read before it is shown
  // (state/pins.tsx, and the sidebar's), but may not be yet, nor its tabs,
  // as it comes in. Once they are, what shows them is made anew, so what is
  // there from the start is simply there, rather than coming in as if new
  // (rows growing in, the pins unfolding); only what changes after moves.
  // Where its tabs and pins were is made anew with them (arrival.ts): the
  // rows made anew are not ones moving from where they were drawn before,
  // which the pins and favourites, read, push down.
  const read = ready && pins.read && settings.read ? "read" : "reading";
  return (
    <>
      <AddressField tab={current} ref={address} onOpenLocation={() => omnibox.toggle("current")} />
      <ArrivalScope key={read}>
        <Favorites
          favorites={pins.favorites}
          read={pins.read}
          settings={settings}
          selected={selected}
          actions={actions}
        />
        <TabList omnibox={omnibox} pinned={pins.pinned} pinActions={actions} />
      </ArrivalScope>
      {dialog}
    </>
  );
}
