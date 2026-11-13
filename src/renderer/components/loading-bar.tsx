// A tab's loading: a pill in the gap above the page's card, centred on it.
// As the page starts to load, the pill blinks, small. If the page is still
// loading after a couple of blinks, the pill comes back wider, and a line
// sweeps through it over and over until the page has loaded. It doesn't say
// how far the page has got. Once the page has loaded, the pill goes out
// from wherever it has got to. If the page starts loading again as it does
// (its loading often turns off and on as it settles), the pill picks up
// from there, not from nothing. Where the window leaves no gap above the
// card, a line along the top of the page stands in for it
// (loading-line.tsx).

import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { useEffect, useRef, useState } from "react";

type Phase = "idle" | "blink" | "sweep";

// A spring that settles without bouncing: a damping ratio of 0.92 and a
// response of 0.8s, as the stiffness and damping of a mass of 1.
const omega = (2 * Math.PI) / 0.8;
const spring = { type: "spring", stiffness: omega ** 2, damping: 2 * 0.92 * omega } as const;
// The springs on `shown` start at rest. Otherwise they carry on its
// velocity, which motion measures over as little as a fraction of a
// millisecond, and can fling the pill to many times its size.
const fromRest = { ...spring, velocity: 0 } as const;
// A blink: in and out, as a sine, over 1.6s; twice before it sweeps. The
// sweep starts as the last blink has gone out, so the change is never seen.
const BLINK = 1.6;
const BLINKS = 2;
const sine = [0.37, 0, 0.63, 1] as const;

export function LoadingBar({ loading }: { loading: boolean }) {
  const [phase, setPhase] = useState<Phase>("idle");
  // How much the pill shows, 0 to 1: its track's opacity, and its scale.
  const shown = useMotionValue(0);
  const scale = useTransform(shown, (value) => 0.88 + 0.12 * Math.min(Math.max(value, 0), 1));
  // With Reduced Motion, it only fades: it does not scale, nor grow wider.
  const still = useReducedMotion();
  // What the animations go on: the phase they are in, the one running,
  // which a newer one supersedes, and the blinks left before the sweep,
  // which a pill going out keeps for when it picks up again.
  const latest = useRef({ phase: "idle" as Phase, running: null as ReturnType<typeof animate> | null, left: BLINKS });

  useEffect(() => {
    const state = latest.current;
    const enter = (next: Phase, running: ReturnType<typeof animate>) => {
      state.phase = next;
      state.running = running;
      setPhase(next);
    };
    // A blink rises from where the pill is, as quickly as a whole one
    // would from there, and goes out.
    const blink = (left: number) => {
      state.left = left;
      const from = Math.min(Math.max(shown.get(), 0), 1);
      const rise = ((1 - from) * BLINK) / 2;
      const duration = rise + BLINK / 2;
      const running = animate(shown, [from, 1, 0], { duration, times: [0, rise / duration, 1], ease: [sine, sine] });
      enter("blink", running);
      running.then(() => {
        if (state.running !== running) return;
        if (left > 1) return blink(left - 1);
        state.left = 0;
        enter("sweep", animate(shown, 1, fromRest));
      });
    };

    if (loading) {
      if (state.phase !== "idle") return;
      // Gone out altogether, it starts afresh.
      if (shown.get() === 0) state.left = BLINKS;
      if (state.left > 0) blink(state.left);
      else enter("sweep", animate(shown, 1, fromRest));
    } else if (state.phase !== "idle") {
      enter("idle", animate(shown, 0, fromRest));
    }
  }, [loading]);

  // Unmounted, it stops; mounted again, it picks up from where it was.
  useEffect(() => {
    const state = latest.current;
    return () => {
      state.running?.stop();
      state.running = null;
      state.phase = "idle";
    };
  }, []);

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-full flex h-2.5 items-center justify-center">
      {/* Small while it blinks, wider while it sweeps. */}
      <motion.div
        className="loading-bar"
        data-phase={phase}
        style={{ scale: still ? 1 : scale }}
        initial={false}
        animate={{ width: phase === "sweep" ? 128 : 48 }}
        transition={still ? { duration: 0 } : spring}
      >
        <motion.i style={{ opacity: shown }} />
        <motion.span initial={false} animate={{ opacity: phase === "sweep" ? 0.92 : 0 }} transition={spring} />
      </motion.div>
    </div>
  );
}
