// The sidebar: the toolbar beside the window's buttons, the address, the
// favourites, and the space's tabs (tab-list.tsx).

import { Archive, Orbit, Plus } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { RefObject } from "react";
import { browser } from "../../ipc";
import { Button } from "../ui/button";
import { AddressField } from "../address/field";
import { Favicon } from "../favicon";
import { BackIcon, ForwardIcon, ReloadIcon, SidebarIcon, StopIcon } from "../icons";
import type { OmniboxState } from "../omnibox/shown";
import { scaleTo } from "../../utils/motion";
import type { SidebarHold } from "./presentation";
import { selectTab, TabList } from "./tab-list";
import { useBrowser } from "../../state/browser";
import { isFolder, useSpace } from "../../state/space";

export type SidebarProps = {
  /** Docked beside the page: its button hides it, rather than keeps it. */
  open: boolean;
  onToggle: () => void;
  /** What keeps it out while what it opened is open. */
  hold: SidebarHold;
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

export function Sidebar({ open, onToggle, hold, omnibox, address, onOpenLibrary }: SidebarProps) {
  const { space } = useSpace();
  const { tabs, current: active } = useBrowser();
  const selected = active?.id;
  const current = [
    ...space.favorites,
    ...space.pinned.flatMap((item) => (isFolder(item) ? item.tabs : [item])),
    ...tabs
  ].find((tab) => tab.id === selected);

  return (
    <div className="flex h-full flex-col">
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

      <AddressField
        tab={current}
        onPopoverOpenChange={hold.setPopoverOpen}
        ref={address}
        onOpenLocation={() => omnibox.toggle("current")}
      />

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

      <TabList omnibox={omnibox} whileOpen={hold.whileOpen} />

      <div className="flex h-12.5 shrink-0 items-center">
        <Button icon={Archive} label="Library" onClick={onOpenLibrary} />
        <div className="flex flex-1 justify-center">
          <Button icon={Orbit} iconSize={15} iconTone="inherit" label={space.name} className="text-accent" />
        </div>
        <Button icon={Plus} label="New Space" />
      </div>
    </div>
  );
}
