// The sidebar footer's spaces, one button each, in the user's order, of any
// profile: the one the window shows is pressed, in the accent. A press brings
// one forward. Too many for the room scroll sideways. The space the window
// makes is a dot after the last, current until it is made. A window on a
// profile has none.
//
// A space is dragged along the row to another place: the others make way as
// it passes, and letting it go asks the app to move it there. One that comes
// or goes opens or closes its place in the row, which the others slide from.
//
// A tab of the list dragged onto a space moves there, and held over it, the
// window switches to it (space-drop.ts).

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { type ReactNode, useLayoutEffect, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { DEFAULT_ICON, SpaceIcon } from "@/components/space-icon";
import { useSpace } from "@/state/space";
import { cn } from "@/utils/cn";
import { EASE_SLIDE, scaleTo } from "@/utils/motion";
import { useSpaceDrop } from "./space-drop";
import { useSpaceReorder } from "./space-reorder";

// The room between two spaces.
const GAP = 2;
const transition = { duration: 0.18, ease: EASE_SLIDE } as const;

export function SpaceSwitcher() {
  const { space, spaces, profile, newSpace, moveSpace, show } = useSpace();
  const row = useRef<HTMLDivElement>(null);
  // The current one stays in view as it changes.
  useLayoutEffect(() => {
    row.current?.querySelector("[data-current]")?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [space.id]);

  const listed = useMemo(() => spaces.map(({ id }) => id), [spaces]);
  const entries = useMemo(() => new Map(spaces.map((entry) => [entry.id, entry])), [spaces]);
  const reorder = useSpaceReorder(row, listed, moveSpace);
  const drop = useSpaceDrop();

  if (profile) return null;
  // Before the app has said, the space shown alone.
  if (!newSpace && !spaces.some(({ id }) => id === space.id)) {
    return (
      <Button
        icon={<SpaceIcon icon={space.icon} size={15} />}
        iconTone="inherit"
        label={space.name}
        className="text-accent"
      />
    );
  }
  return (
    <div ref={row} className="flex min-w-0 overflow-x-auto scrollbar-none" style={{ gap: GAP }}>
      <div className="flex shrink-0" style={{ gap: GAP }} onClickCapture={reorder.onClickCapture}>
        <AnimatePresence initial={false}>
          {reorder.order.map((id) => {
            const entry = entries.get(id);
            if (!entry) return null;
            const current = id === space.id;
            return (
              <Appear key={id}>
                <div
                  data-space-slot={id}
                  style={reorder.styleOf(id)}
                  onPointerDown={reorder.onPointerDown(id)}
                  {...drop.handlersOf(id)}
                  className="flex shrink-0"
                >
                  <Button
                    icon={<SpaceIcon icon={entry.icon} size={15} />}
                    iconTone={current ? "inherit" : "dim"}
                    label={entry.name}
                    data-current={current || undefined}
                    pressed={drop.over === id}
                    className={cn(current && "text-accent")}
                    onClick={() => show(id)}
                  />
                </div>
              </Appear>
            );
          })}
        </AnimatePresence>
      </div>
      {/* As the space is made, the dot closes as its space opens beside it. */}
      <AnimatePresence initial={false}>
        {newSpace && (
          <Appear key="new">
            <Button
              icon={<SpaceIcon icon={DEFAULT_ICON} size={15} />}
              iconTone="inherit"
              label="New Space"
              data-current
              className="text-accent"
            />
          </Appear>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * A space's place in the row, opening as it comes and closing as it goes,
 * with the gap before it; the space grows in and fades in the middle of it.
 * With Reduced Motion, the place is there at once, and the space only fades.
 */
function Appear({ children }: { children: ReactNode }) {
  const still = useReducedMotion();
  const away = { width: still ? "auto" : 0, marginRight: still ? 0 : -GAP };
  return (
    <motion.div
      initial={away}
      animate={{ width: "auto", marginRight: 0 }}
      exit={away}
      transition={transition}
      className="flex shrink-0 justify-center"
    >
      <motion.div
        initial={{ opacity: 0, ...scaleTo(still, 0.8) }}
        animate={{ opacity: 1, ...scaleTo(still, 1) }}
        exit={{ opacity: 0, ...scaleTo(still, 0.8) }}
        transition={transition}
        className="flex shrink-0"
      >
        {children}
      </motion.div>
    </motion.div>
  );
}
