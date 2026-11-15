// The card under the Library's settings, above More Settings…: whether Wren
// opens the links clicked in other apps. Wren's bird on its tile, a line
// that says where things stand, and Make Default under it, a white capsule
// as wide as the card, which is narrow. Once Wren is the default, the button
// folds away and a tick comes onto the tile.

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { DefaultBrowser } from "@/ipc";
import { TileBadge, WrenTile } from "@/components/tile-icon";
import { Button } from "@/components/ui/button";

// Its lines, by whether Wren is the default and may be made so.
export function defaultBrowserText({ isDefault, canSet }: DefaultBrowser) {
  if (isDefault) return { title: "Wren Is Your Default Browser", about: "Links you click in other apps open here." };
  return {
    title: "Make Wren Your Default",
    about: canSet ? "Links you click in other apps will open here." : "Your organisation chooses the default browser."
  };
}

export function DefaultBrowserCard({ state, onSet }: { state: DefaultBrowser; onSet: () => void }) {
  const reduced = useReducedMotion();
  const isDefault = state.isDefault === true;
  const { title, about } = defaultBrowserText(state);
  return (
    <div className="flex flex-col rounded-[16px] bg-fill p-3.5 shadow-[inset_0_0.5px_0_rgb(255_255_255/0.12)]">
      <div className="flex items-center gap-3">
        <WrenTile size={40}>
          <AnimatePresence initial={false}>
            {isDefault && (
              <motion.span
                key="tick"
                className="absolute -right-1.5 -bottom-1.5"
                initial={reduced ? { opacity: 0 } : { scale: 0.4, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ type: "spring", duration: 0.4, bounce: 0.35 }}
              >
                <Tick />
              </motion.span>
            )}
          </AnimatePresence>
        </WrenTile>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="font-medium text-balance">{title}</span>
          <span className="text-subtitle text-pretty text-fg-2">{about}</span>
        </span>
      </div>
      <AnimatePresence initial={false}>
        {!isDefault && (
          <motion.div
            key="set"
            className="overflow-hidden"
            initial={reduced ? { opacity: 0 } : { height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={reduced ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={{ type: "spring", duration: 0.35, bounce: 0 }}
          >
            {/* Padding, not a gap, so it folds away with the button. */}
            <div className="pt-3">
              <Button
                variant="bright"
                className="h-7.5 w-full rounded-full font-medium"
                disabled={!state.canSet}
                onClick={onSet}
              >
                Make Default
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// A green badge with a white tick.
function Tick() {
  return (
    <TileBadge tone="green">
      <path d="M5.6 9.2 7.8 11.3 12.4 6.7" />
    </TileBadge>
  );
}
