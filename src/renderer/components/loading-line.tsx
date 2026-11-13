// A tab's loading where the window leaves no gap above the page for the
// pill (loading-bar.tsx): a thin line along the top of the page, under its
// address bar if it has one, in the space's hue. The line brightens to
// its head, which glows and breathes, and its colour washes down over the
// top of the page below it, most under the head.
//
// The head shows how far the page's load has got. It goes there each time
// the tab's progress changes, and creeps on between changes, so a slow page
// is never still. The head never claims to have arrived while the page is
// loading. Once the page has loaded, the head runs to the right edge and on
// past it, and the rest of the line follows it out, fading as it goes. The
// styles are in loading-line.css.

import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { EASE_LEAVE, EASE_SLIDE } from "@/utils/motion";

// The furthest the head gets while the page is loading.
const LATE = 0.94;
// The share of the way left to there that the head creeps between changes
// of the progress.
const CREEP = 0.5;

type Running = ReturnType<typeof animate>;

export function LoadingLine({
  loading,
  progress
}: {
  loading: boolean;
  /** How far the page's load has got, in whole percent (`BrowserTab.progress`). */
  progress: number;
}) {
  const [shown, setShown] = useState(false);
  // Where the head is: 0 at the page's left edge, 1 at its right, and 2
  // once the whole line has followed it out.
  const at = useMotionValue(0);
  const x = useTransform(at, (value) => `${(value - 1) * 100}%`);
  const opacity = useMotionValue(0);
  // With Reduced Motion the line does not travel: it fades in whole, and out.
  const still = useReducedMotion();
  // What the last run of the effect saw, and the animations it started,
  // the first of which is the one that says when they are done.
  const latest = useRef({ loading: false, progress, running: [] as Running[] });

  useEffect(() => {
    const state = latest.current;
    const wasLoading = state.loading;
    const moved = loading && wasLoading && state.progress !== progress;
    state.loading = loading;
    state.progress = progress;
    if (loading === wasLoading && !moved) return;

    // Starts these in place of what is running, and returns the first.
    const run = (...running: Running[]) => {
      for (const old of state.running) old.stop();
      state.running = running;
      return running[0];
    };
    const current = (running: Running) => state.running[0] === running;

    if (!loading) {
      const gone = still
        ? run(animate(opacity, 0, { duration: 0.3, ease: EASE_LEAVE }))
        : run(
            animate(at, [at.get(), 1, 2], { duration: 0.85, times: [0, 0.35, 1], ease: [EASE_SLIDE, EASE_SLIDE] }),
            animate(opacity, 0, { duration: 0.4, delay: 0.4, ease: EASE_LEAVE })
          );
      void gone.then(() => {
        if (!current(gone)) return;
        at.set(0);
        setShown(false);
      });
      return;
    }

    setShown(true);
    if (still) {
      at.set(1);
      run(animate(opacity, 1, { duration: 0.2, ease: "easeOut" }));
      return;
    }
    // Loading again before the head got out (a page's loading often turns
    // off and on as it settles), it carries on from where it is.
    if (!wasLoading && at.get() >= LATE) at.set(0);
    // Never back, as the creep may have gone past the progress.
    const from = at.get();
    const to = Math.max(from, Math.min(progress / 100, LATE));
    const push = run(
      animate(at, to, { duration: 0.5, ease: EASE_SLIDE }),
      animate(opacity, 1, { duration: 0.1, ease: "easeOut" })
    );
    void push.then(() => {
      if (current(push)) run(animate(at, to + (LATE - to) * CREEP, { duration: 12, ease: "easeOut" }));
    });
  }, [loading, progress, still, at, opacity]);

  // Unmounted, it stops.
  useEffect(() => {
    const state = latest.current;
    return () => {
      for (const running of state.running) running.stop();
      state.running = [];
      state.loading = false;
    };
  }, []);

  if (!shown) return null;
  return (
    <div aria-hidden className="loading-line">
      <motion.div style={{ x, opacity }}>
        <i />
        <b>
          <span />
        </b>
      </motion.div>
    </div>
  );
}
