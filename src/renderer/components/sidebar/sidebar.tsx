// The sidebar: the toolbar beside the window's buttons, the address, the
// favourites, and the space's tabs (tab-list.tsx); or, while the window is
// on no space, the form for a new one (new-space.tsx).

import { Archive, Plus } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion, useTransform } from "motion/react";
import { type RefObject, useRef } from "react";
import { browser } from "../../ipc";
import { Button } from "../ui/button";
import { AddressField } from "../address/field";
import { Favicon } from "../favicon";
import { BackIcon, ForwardIcon, ReloadIcon, SidebarIcon, StopIcon } from "../icons";
import type { OmniboxState } from "../omnibox/shown";
import { cn } from "../../utils/cn";
import { scaleTo } from "../../utils/motion";
import { NewSpaceForm } from "./new-space";
import { useSpaceSwipe } from "./space-swipe";
import { SpaceSwitcher } from "./space-switcher";
import { selectTab, TabList } from "./tab-list";
import { BrowserOfSpace, useBrowser } from "../../state/browser";
import { isFolder, useSpace } from "../../state/space";
import { SLIDE } from "../../state/space-slide";

export type SidebarProps = {
  /** Docked beside the page: its button hides it, rather than keeps it. */
  open: boolean;
  onToggle: () => void;
  /** The omnibox, which the address and the New Tab row open. */
  omnibox: OmniboxState;
  /** For the address field, whose box the omnibox for the active tab opens over. */
  address: RefObject<HTMLDivElement | null>;
  onOpenLibrary: () => void;
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

export function Sidebar({ open, onToggle, omnibox, address, onOpenLibrary }: SidebarProps) {
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
  const { current: active } = useBrowser();

  return (
    <div ref={area} className="flex h-full flex-col">
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
      <div className={cn("-mx-2 flex min-h-0 flex-1 flex-col overflow-x-clip px-2", newSpace && "no-drag")}>
        <motion.div style={{ x: swipe, opacity: fade }} className="flex min-h-0 flex-1 flex-col">
          {newSpace ? (
            <NewSpaceForm state={newSpace} />
          ) : (
            // Each space's own, so one's tabs never leave or arrive in another's.
            <BrowserOfSpace key={space.id} space={space.id}>
              <SpaceContent omnibox={omnibox} address={address} />
            </BrowserOfSpace>
          )}
        </motion.div>
      </div>

      {/* While a space is made, only the switcher: the form is left by its own
          buttons, or by another space. */}
      <div className={cn("flex h-12.5 shrink-0 items-center", newSpace && "no-drag")}>
        {!newSpace && <Button icon={Archive} label="Library" onClick={onOpenLibrary} />}
        <div className="flex min-w-0 flex-1 justify-center px-1">
          <SpaceSwitcher />
        </div>
        {/* A window on a profile never switches, so makes no space. */}
        {!profile && !newSpace && <Button icon={Plus} label="New Space" onClick={() => startNewSpace()} />}
      </div>
    </div>
  );
}

/** What the sidebar shows of the space, below its toolbar: the address, the favourites and the tabs. */
function SpaceContent({ omnibox, address }: Pick<SidebarProps, "omnibox" | "address">) {
  const { space } = useSpace();
  const { tabs, current: active } = useBrowser();
  const selected = active?.id;
  const current = [
    ...space.favorites,
    ...space.pinned.flatMap((item) => (isFolder(item) ? item.tabs : [item])),
    ...tabs
  ].find((tab) => tab.id === selected);
  return (
    <>
      <AddressField tab={current} ref={address} onOpenLocation={() => omnibox.toggle("current")} />

      <div className="mt-2 grid shrink-0 grid-cols-3 gap-2">
        {space.favorites.map((tab) => (
          <Button
            key={tab.id}
            variant="filled"
            shape="none"
            label={tab.title}
            pressed={tab.id === selected}
            onPointerDown={() => selectTab(tab)}
            className="grid h-11.75 place-items-center rounded-field"
          >
            <Favicon url={tab.url} title={tab.title} />
          </Button>
        ))}
      </div>

      <TabList omnibox={omnibox} />
    </>
  );
}
