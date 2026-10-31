// The card under the Library's settings, above More Settings…: whether Wren
// opens the links clicked in other apps. Wren's bird on its tile, a line
// that says where things stand, and Make Default under it, a white capsule
// as wide as the card, which is narrow. Once Wren is the default, the button
// folds away and a tick comes onto the tile.

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useId } from "react";
import type { DefaultBrowser } from "@/ipc";
import { WrenMark } from "@/components/icons";
import { TileIcon, TONES } from "@/components/tile-icon";
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
        <span className="relative grid size-10 shrink-0 place-items-center">
          <span className="absolute inset-0">
            <TileIcon tone="wren" size={40} />
          </span>
          <span className="relative text-white">
            <WrenMark size={23} />
          </span>
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
        </span>
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

// A green disc with a white tick, ringed in white so it sits clear of the
// tile, as the system badges an icon.
function Tick() {
  const id = useId();
  const [top, bottom] = TONES.green;
  return (
    <svg width={18} height={18} viewBox="0 0 18 18" aria-hidden className="drop-shadow-[0_1px_1px_rgb(0_0_0/0.25)]">
      <defs>
        <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={top} />
          <stop offset="1" stopColor={bottom} />
        </linearGradient>
      </defs>
      <circle cx="9" cy="9" r="8.25" fill={`url(#${id}-fill)`} stroke="#fff" strokeWidth="1.5" />
      <path
        d="M5.6 9.2 7.8 11.3 12.4 6.7"
        fill="none"
        stroke="#fff"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
