// The update, at the bottom of the sidebar, above its buttons. A new version
// of Wren is a line that says so, and fills as it downloads. A rest of the
// pointer on it, or Check for Updates…, opens it upward, over the content,
// into a card that takes the next step (download, then restart and install)
// and says whether updates download by themselves; its button changes in
// place from step to step. Closed, it is a pill, as round as it is tall.
// Once installed, a card says so, open until it is closed, with what is new
// in it and a way to send feedback. Both have a faint edge; their colours
// are --update-* in update.css. Going, either folds into its line as it
// fades, and the room it took closes.

import { MessageSquare, Sparkles, X } from "lucide-react";
import { AnimatePresence, type MotionValue, motion, useIsPresent, useReducedMotion } from "motion/react";
import { type ReactElement, type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useHoldWhile } from "@/components/ui/hold";
import { browser } from "@/ipc";
import { type Update, useUpdate } from "@/state/update";
import { cn } from "@/utils/cn";

// How long the pointer rests on it before it opens, and how long after it
// leaves that it closes, in milliseconds: passing over it on the way to the
// buttons below does not open it. Opened by Check for Updates…, it closes by
// itself if the pointer never comes.
const OPEN_AFTER = 120;
const CLOSE_AFTER = 300;
const ASKED_FOR = 6000;

const ease = { duration: 0.24, ease: [0.23, 1, 0.32, 1] } as const;

// Its line's height, in points.
const LINE = 26;

const REPOSITORY = "https://github.com/MultiboxLabs/wren-browser";

/**
 * `cover`: how far up from its line it reaches over the content, as it opens
 * and closes; the content is cut off there (sidebar.tsx).
 */
export function UpdateCard({ cover }: { cover: MotionValue<number> }) {
  const update = useUpdate();
  return (
    <AnimatePresence initial={false} mode="wait">
      {update.installed ? (
        <Complete key="complete" update={update} cover={cover} />
      ) : update.phase !== "none" ? (
        <Available key="available" update={update} cover={cover} />
      ) : null}
    </AnimatePresence>
  );
}

// What the button says at each step. "none" only as the card goes, once
// installed, and then it says it is ready.
const ACTIONS = {
  available: "Download Update",
  downloading: "Downloading…",
  ready: "Restart and Update"
};

function Available({ update, cover }: { update: Update; cover: MotionValue<number> }) {
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const after = (wait: number, open: boolean) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(open), wait);
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (!update.asked) return;
    update.answered();
    setOpen(true);
    after(ASKED_FOR, false);
  }, [update.asked]);
  // The floating sidebar stays out while it is open.
  useHoldWhile(open);
  // Going, it folds.
  const present = useIsPresent();
  const shown = open && present;
  const phase = update.phase === "none" ? "ready" : update.phase;
  const downloading = phase === "downloading";
  return (
    <Shell
      cover={cover}
      open={shown}
      onPointerEnter={() => after(OPEN_AFTER, true)}
      onPointerLeave={() => after(CLOSE_AFTER, false)}
      onPressOutside={() => after(0, false)}
    >
      <div className="relative flex h-6.5 items-center justify-center px-3 font-medium">
        {/* The download's progress, filling the line from its start, closed;
            open, the button shows it. */}
        <motion.div
          role={downloading ? "progressbar" : undefined}
          aria-label="Download"
          aria-valuenow={downloading && update.progress !== null ? Math.round(update.progress * 100) : undefined}
          initial={false}
          animate={{
            width: `${(downloading ? (update.progress ?? 0) : 1) * 100}%`,
            opacity: downloading && update.progress !== null && !shown ? 1 : 0
          }}
          transition={{ width: { duration: 0.2, ease: "linear" }, opacity: ease }}
          className="absolute inset-y-0 left-0 bg-[color-mix(in_oklab,var(--update-accent)_22%,transparent)]"
        />
        <span className="relative truncate">New Version of Wren Available</span>
      </div>
      <Unfold open={shown}>
        <div className="flex flex-col items-center gap-2 border-t border-separator px-2 pt-2.5 pb-2">
          <Checkbox checked={update.automatic} onCheckedChange={update.setAutomatic}>
            Automatic Updates
          </Checkbox>
          {/* Lit from above, as the platform's default button is. While it
              downloads, it is the progress: what is left of it pales. */}
          <Button
            variant="prominent"
            shape="none"
            scale={downloading ? 1 : 0.98}
            aria-disabled={downloading}
            style={{ backgroundImage: "linear-gradient(rgb(255 255 255 / 0.12), transparent)" }}
            className="relative h-6 w-full overflow-hidden rounded-[7px] shadow-[inset_0_0_0_1px_rgb(255_255_255/0.12),0_1px_2px_rgb(0_0_0/0.2)]"
            onClick={downloading ? undefined : phase === "available" ? update.download : update.restart}
          >
            <motion.span
              aria-hidden
              initial={false}
              animate={{ left: `${(downloading ? (update.progress ?? 0) : 1) * 100}%` }}
              transition={{ duration: downloading ? 0.2 : 0, ease: "linear" }}
              className="absolute inset-y-0 right-0 bg-white/40"
            />
            <span className="relative">
              <Swap text={ACTIONS[phase]} />
            </span>
          </Button>
        </div>
      </Unfold>
    </Shell>
  );
}

// A line of text that fades into the next, in place, as it changes.
function Swap({ text }: { text: string }) {
  return (
    <span className="grid">
      <AnimatePresence initial={false}>
        <motion.span
          key={text}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={ease}
          className="truncate [grid-area:1/1]"
        >
          {text}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

// Open from the start: it unfolds from the line as the window opens on the
// new version, and stays until it is closed or one of its rows is taken.
function Complete({ update, cover }: { update: Update; cover: MotionValue<number> }) {
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(true), []);
  const present = useIsPresent();
  const shown = open && present;
  const go = (url: string) => {
    void browser.open(url);
    update.dismiss();
  };
  return (
    <Shell cover={cover} open={shown}>
      <div className="relative flex h-6.5 items-center justify-center px-7 font-medium">
        <span className="truncate">Update Complete!</span>
        {/* As far in from the card's top and right edges, with corners
            that follow the card's, which are 3 points out from its own. */}
        <Button
          icon={X}
          iconSize={12}
          label="Close"
          className="absolute right-0.75 size-5 rounded-[8px]"
          onClick={update.dismiss}
        />
      </div>
      <Unfold open={shown}>
        <div className="flex flex-col border-t border-separator p-1">
          <Row
            icon={<Sparkles size={14} strokeWidth={1.75} fill="currentColor" />}
            className="text-(--update-accent)"
            onClick={() => go(`https://wrenbrowser.com/releases/${update.installed}`)}
          >
            See What’s New
          </Row>
          <Row
            icon={<MessageSquare size={14} strokeWidth={1.75} />}
            className="text-fg-2"
            onClick={() => go(`${REPOSITORY}/issues/new`)}
          >
            Send Feedback
          </Row>
        </div>
      </Unfold>
    </Shell>
  );
}

// One of the complete card's rows: an icon and a line, in its colour.
function Row({
  icon,
  className,
  onClick,
  children
}: {
  icon: ReactElement;
  className: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Button
      shape="none"
      icon={icon}
      iconTone="inherit"
      className={cn("flex h-6.5 w-full items-center gap-2 rounded-[7px] px-2 text-left", className)}
      onClick={onClick}
    >
      <span className="truncate">{children}</span>
    </Button>
  );
}

// The box, its line's room; open, it grows up from it, over the content.
function Shell({
  cover,
  open,
  onPointerEnter,
  onPointerLeave,
  onPressOutside,
  children
}: {
  cover: MotionValue<number>;
  open: boolean;
  onPointerEnter?: () => void;
  onPointerLeave?: () => void;
  /** Open, a press anywhere else in the page. */
  onPressOutside?: () => void;
  children: ReactNode;
}) {
  // How far it reaches, each frame as it grows and shrinks.
  const box = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const node = box.current;
    if (!node) return;
    const observer = new ResizeObserver(() => cover.set(Math.max(0, node.offsetHeight - LINE)));
    observer.observe(node);
    return () => {
      observer.disconnect();
      cover.set(0);
    };
  }, []);
  useEffect(() => {
    if (!open || !onPressOutside) return;
    const press = (event: PointerEvent) => {
      if (!box.current?.contains(event.target as Node)) onPressOutside();
    };
    document.addEventListener("pointerdown", press, true);
    return () => document.removeEventListener("pointerdown", press, true);
  }, [open]);
  const still = useReducedMotion();
  return (
    <motion.div
      initial={{ height: still ? "auto" : 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      exit={{ height: still ? "auto" : 0, opacity: 0 }}
      transition={ease}
      className="relative shrink-0"
    >
      {/* Its room, in here, so that it all closes. */}
      <div className="pt-2">
        <div className="relative h-6.5">
          <div
            ref={box}
            role="group"
            aria-label="Update"
            onPointerEnter={onPointerEnter}
            onPointerLeave={onPointerLeave}
            className={cn(
              "no-drag absolute inset-x-0 bottom-0 text-subtitle transition-[border-radius] duration-200",
              open ? "rounded-[11px]" : "rounded-[13px]"
            )}
          >
            {/* The pill's fill and the card's, one fading into the other. Not a
                transition of one fill: that would also ease from light to dark
                as the space's scheme changes, where all else changes at once. */}
            <motion.div
              initial={false}
              animate={{ opacity: open ? 0 : 1 }}
              transition={ease}
              className="absolute inset-0 rounded-[inherit] bg-fill shadow-[inset_0_0_0_1px_var(--update-edge)]"
            />
            <motion.div
              initial={false}
              animate={{ opacity: open ? 1 : 0 }}
              transition={ease}
              className="absolute inset-0 rounded-[inherit] bg-(--update-card) shadow-[inset_0_0_0_1px_var(--update-edge),0_6px_20px_rgb(0_0_0/0.18)]"
            />
            <div className="relative overflow-hidden rounded-[inherit]">{children}</div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// What the card shows below its line, open.
function Unfold({ open, children }: { open: boolean; children: ReactNode }) {
  const still = useReducedMotion();
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          initial={{ height: still ? "auto" : 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: still ? "auto" : 0, opacity: 0 }}
          transition={ease}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
