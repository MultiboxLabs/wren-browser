// The sidebar footer's spaces, one button each, in the user's order, of any
// profile: the one the window shows is pressed, in the accent. A press brings
// one forward. With room for all, each is an icon. With less, the one shown
// is the only icon and the others are dots, and with less still, the dots
// farthest from it are left out (space-fit.ts). The space the window makes
// is one after the last, current until it is made. A window on a profile has
// none.
//
// A space is dragged along the row to another place: the others make way as
// it passes, and letting it go asks the app to move it there. One that comes
// or goes opens or closes its place in the row, which the others slide from.
//
// A tab dragged onto a space moves there, and held over it, the window
// switches to it (space-drop.ts says which tabs).

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { type ReactNode, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { DEFAULT_ICON, SpaceIcon } from "@/components/space-icon";
import { useSpace } from "@/state/space";
import { cn } from "@/utils/cn";
import { EASE_SLIDE, scaleTo } from "@/utils/motion";
import { fit, GAP } from "./space-fit";
import { useSpaceDrop } from "./space-drop";
import { useSpaceReorder } from "./space-reorder";

const transition = { duration: 0.18, ease: EASE_SLIDE } as const;

// A button's icon and dot fade and scale into each other. Each is shown or
// hidden, and a dot's pair swap while the pointer is over the button
// (`group/button`, ui/button.tsx).
const GLYPH = "grid place-items-center transition-[opacity,scale] duration-100 motion-reduce:transition-none";
const SHOWN = "opacity-100 scale-100";
const HIDDEN = "opacity-0 scale-50";
const REVEAL = "group-hover/button:opacity-100 group-hover/button:scale-100";
const CONCEAL = "group-hover/button:opacity-0 group-hover/button:scale-50";

export function SpaceSwitcher() {
  const { space, spaces, profile, newSpace } = useSpace();
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
  return <SpaceRow />;
}

function SpaceRow() {
  const { space, spaces, newSpace, moveSpace, show } = useSpace();
  const box = useRef<HTMLDivElement>(null);
  // The room the row has, read before it is first drawn.
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const read = () => setWidth(el.clientWidth);
    read();
    const observer = new ResizeObserver(read);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const listed = useMemo(() => spaces.map(({ id }) => id), [spaces]);
  const entries = useMemo(() => new Map(spaces.map((entry) => [entry.id, entry])), [spaces]);
  // The spaces and the one being made, after them, as one row; and which of
  // them fit around the current one.
  const count = listed.length + (newSpace ? 1 : 0);
  const current = newSpace ? listed.length : Math.max(0, listed.indexOf(space.id));
  const { from, to, dots } = fit(count, current, width);

  const reorder = useSpaceReorder(box, listed, listed.slice(from, to), moveSpace);
  const drop = useSpaceDrop();
  const shown = reorder.order.slice(from, to);

  return (
    <div ref={box} className="flex min-w-0 flex-1 justify-center">
      <div className="flex items-center" style={{ gap: GAP }}>
        <div className="flex shrink-0 items-center" style={{ gap: GAP }} onClickCapture={reorder.onClickCapture}>
          <AnimatePresence initial={false}>
            {shown.map((id) => {
              const entry = entries.get(id);
              if (!entry) return null;
              const here = id === space.id;
              return (
                <Appear key={id}>
                  <div
                    data-space-slot={id}
                    style={reorder.styleOf(id)}
                    onPointerDown={reorder.onPointerDown(id)}
                    {...drop.handlersOf(id)}
                    className="flex shrink-0 items-center"
                  >
                    <SpaceButton
                      icon={entry.icon}
                      label={entry.name}
                      current={here}
                      dot={dots && !here}
                      pressed={drop.over === id}
                      onClick={() => show(id)}
                    />
                  </div>
                </Appear>
              );
            })}
          </AnimatePresence>
        </div>
        {/* As the space is made, its place closes as the space opens beside it. */}
        <AnimatePresence initial={false}>
          {newSpace && to > listed.length && (
            <Appear key="new">
              <SpaceButton icon={DEFAULT_ICON} label="New Space" current dot={false} />
            </Appear>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

type SpaceButtonProps = {
  icon: string;
  label: string;
  /** The space the window shows: in the accent. */
  current: boolean;
  /** Drawn as a dot, not an icon. */
  dot: boolean;
  pressed?: boolean;
  onClick?: () => void;
};

/**
 * A space's button: its icon, or a dot where there isn't room for it, as a
 * square of its own size. Under the pointer, or with a tab dragged over it
 * (`pressed`), a dot grows a little and shows its icon, and the others make
 * room. The icon and the dot fade into each other, in the same place.
 */
function SpaceButton({ icon, label, current, dot, pressed, onClick }: SpaceButtonProps) {
  const grown = !dot || pressed;
  return (
    <Button
      shape="none"
      scale={0.94}
      label={label}
      pressed={pressed}
      className={cn(
        "inline-grid place-items-center rounded-control transition-[width,height] duration-180 motion-reduce:transition-none",
        !dot ? "size-7" : pressed ? "size-6" : "size-5 hover:size-6",
        current && "text-accent"
      )}
      onClick={onClick}
    >
      <span className={cn("grid place-items-center *:col-start-1 *:row-start-1", !current && "glyph-2")}>
        <span className={cn(GLYPH, grown ? SHOWN : `${HIDDEN} ${REVEAL}`)}>
          <SpaceIcon icon={icon} size={15} />
        </span>
        <span className={cn(GLYPH, grown ? HIDDEN : `${SHOWN} ${CONCEAL}`)}>
          <span className="size-[7px] rounded-full bg-current" />
        </span>
      </span>
    </Button>
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
      className="flex shrink-0 items-center justify-center"
    >
      <motion.div
        initial={{ opacity: 0, ...scaleTo(still, 0.8) }}
        animate={{ opacity: 1, ...scaleTo(still, 1) }}
        exit={{ opacity: 0, ...scaleTo(still, 0.8) }}
        transition={transition}
        className="flex shrink-0 items-center"
      >
        {children}
      </motion.div>
    </motion.div>
  );
}
