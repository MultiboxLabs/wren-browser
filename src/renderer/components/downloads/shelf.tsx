// The shelf: the latest downloads, over the bottom of the sidebar, above its
// Library button, the newest nearest the button. A rest of the pointer on
// the button shows it, and it stays while the pointer is on either, or a
// row's menu is open; as all downloads are done it shows by itself for a few
// seconds, as Chrome's bubble does. The sidebar's content fades out under
// it, so it reads as part of the sidebar, on the window, not a surface over
// it.

import { AnimatePresence, animate, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { analytics, downloads, hasApp } from "@/ipc";
import { useHoldWhile } from "@/components/ui/hold";
import { lastChanged, newestFirst, useDownloads } from "@/state/downloads";
import { ago, useNow } from "@/utils/now";
import { statusLine } from "./format";
import { DownloadRow } from "./row";

/** How many downloads it shows. */
const COUNT = 5;

// How long the pointer rests on the button before it shows; how long after
// nothing keeps it that it goes; and how long it shows by itself, in
// milliseconds.
const SHOW_AFTER = 300;
const HIDE_AFTER = 300;
const SHOWN_BY_ITSELF_FOR = 5000;

// How far above the shelf the content starts to fade, in points.
const FADE = 48;

const ease = { duration: 0.2, ease: [0.23, 1, 0.32, 1] } as const;

export type ShelfState = ReturnType<typeof useShelf>;

/**
 * Whether the shelf shows, what keeps it, and the mask that fades the
 * sidebar's content above it. `visible`: the sidebar is out, and not the
 * Library in its place; only then does it show.
 */
export function useShelf(visible: boolean) {
  const list = useDownloads();
  // Oldest first, so the newest is nearest the button.
  const latest = useMemo(() => [...list].sort(newestFirst).slice(0, COUNT).reverse(), [list]);
  const [shown, setShown] = useState(false);

  // What keeps it: the pointer on the button or on the shelf, or a row's menu.
  const keeps = useRef({ button: false, shelf: false, menu: false });
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const after = (wait: number, run: () => void) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(run, wait);
  };
  // It goes `wait` after nothing keeps it.
  const release = (wait = HIDE_AFTER) => {
    if (Object.values(keeps.current).some(Boolean)) clearTimeout(timer.current);
    else after(wait, () => setShown(false));
  };
  const keep = (what: keyof typeof keeps.current, on: boolean) => {
    keeps.current[what] = on;
    release();
  };
  useEffect(() => () => clearTimeout(timer.current), []);

  // By itself, as Chromium's bubble would show: not while the sidebar is
  // away, or with nothing to show, when the bubble's request closes at once.
  const canShow = useRef(false);
  canShow.current = visible && latest.length > 0;
  useEffect(
    () =>
      hasApp
        ? downloads.onShowShelf(() => {
            if (!canShow.current) return void downloads.shelfDone();
            setShown(true);
            release(SHOWN_BY_ITSELF_FOR);
          })
        : undefined,
    []
  );
  useEffect(() => {
    if (!canShow.current) setShown(false);
  }, [visible, latest.length]);
  // The bubble's request closes as the shelf goes; the app ignores this
  // for a shelf it did not show.
  const wasShown = useRef(false);
  useEffect(() => {
    if (wasShown.current && !shown && hasApp) void downloads.shelfDone();
    if (!wasShown.current && shown && hasApp) analytics.record({ event: "downloads_shelf_opened" }).catch(() => {});
    wasShown.current = shown;
  }, [shown]);

  // How much of the content the shelf covers, which fades out above it.
  const cover = useMotionValue(0);
  const mask = useTransform(cover, (height) =>
    height > 0
      ? `linear-gradient(to bottom, black calc(100% - ${height + FADE}px), transparent calc(100% - ${height}px))`
      : "none"
  );

  return {
    latest,
    shown,
    cover,
    /** For the content above the shelf: `maskImage`. */
    mask,
    /** For the Library button: a rest of the pointer on it shows the shelf. */
    button: {
      onPointerEnter: () => {
        keep("button", true);
        if (canShow.current) after(SHOW_AFTER, () => setShown(true));
      },
      onPointerLeave: () => keep("button", false)
    },
    /** For the shelf. */
    shelf: {
      onPointerEnter: () => keep("shelf", true),
      onPointerLeave: () => keep("shelf", false)
    },
    /** A row's menu keeps it until the menu closes. */
    onMenu: (closed: Promise<unknown>) => {
      keep("menu", true);
      void closed.then(() => keep("menu", false));
    },
    /** It goes at once, as the Library opens. */
    hide: () => {
      clearTimeout(timer.current);
      setShown(false);
    }
  };
}

/** The shelf, over the bottom of the content `shelf.mask` fades. */
export function Shelf({ shelf }: { shelf: ShelfState }) {
  const still = useReducedMotion();
  const now = useNow();
  const box = useRef<HTMLDivElement>(null);
  useHoldWhile(shelf.shown);
  // The content fades as far up as the shelf reaches.
  useLayoutEffect(() => {
    const height = shelf.shown ? (box.current?.offsetHeight ?? 0) : 0;
    const motion = animate(shelf.cover, height, still ? { duration: 0 } : ease);
    return () => motion.stop();
  }, [shelf.shown, shelf.latest.length]);

  return (
    <AnimatePresence>
      {shelf.shown && (
        <motion.div
          ref={box}
          role="list"
          aria-label="Recent Downloads"
          initial={{ opacity: 0, ...(still ? {} : { y: 8 }) }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, ...(still ? {} : { y: 8 }) }}
          transition={ease}
          {...shelf.shelf}
          className="absolute inset-x-0 bottom-full flex flex-col gap-0.5 pb-1"
        >
          {shelf.latest.map((download) => (
            <DownloadRow
              key={download.id}
              download={download}
              line={statusLine(download) ?? ago(lastChanged(download), now)}
              onMenu={shelf.onMenu}
            />
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
