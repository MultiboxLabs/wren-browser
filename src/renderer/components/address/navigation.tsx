// Back, forward, and reload, which turns into stop while the page loads: in
// the sidebar's toolbar, or in the address bar atop the page while the
// Address Bar setting puts it there (page-bar.tsx). Each acts on the active
// tab, as the main menu's do.

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { browser, type BrowserTab } from "@/ipc";
import { BackIcon, ForwardIcon, ReloadIcon, StopIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { scaleTo } from "@/utils/motion";
import { cn } from "@/utils/cn";

/** What the buttons show of the tab they act on. */
export type NavigationTab = Pick<BrowserTab, "canGoBack" | "canGoForward" | "loading">;

export function Navigation({ tab, className }: { tab?: NavigationTab; className?: string }) {
  return (
    <div className={cn("flex", className)}>
      <Button icon={BackIcon} label="Back" iconSize={17} disabled={!tab?.canGoBack} onClick={() => browser.back()} />
      <Button
        icon={ForwardIcon}
        label="Forward"
        iconSize={17}
        disabled={!tab?.canGoForward}
        onClick={() => browser.forward()}
      />
      <ReloadButton loading={tab?.loading ?? false} />
    </div>
  );
}

// Stop's cross grows in quickly where reload's icon was, which goes at once,
// and shrinks away before reload's comes back; one is shown at a time. It
// scales alone, with no fade; with Reduced Motion, the two simply swap.
const stopMotion = (still: boolean | null) => ({
  initial: scaleTo(still, 0),
  animate: scaleTo(still, 1),
  exit: scaleTo(still, 0),
  transition: { duration: 0.12, ease: "easeOut" as const }
});

/** Reload, which turns into stop while the tab loads. */
function ReloadButton({ loading }: { loading: boolean }) {
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
      onClick={() => (loading ? browser.stop() : browser.reload())}
    />
  );
}
