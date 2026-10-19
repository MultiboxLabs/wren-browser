// A tab's loading, inspired by Arc's: a pill in the gap above the page's
// card, centred on it. As the page starts to load, the pill blinks, small.
// If the page is still loading after a couple of blinks, the pill comes
// back wider, and a line sweeps through it over and over until the page
// has loaded. Neither says how far the page has got.
// A blink, once started, always plays out: it is the pill's way out for a
// page that loads quickly, and it rides out the page's loading turning off
// and on again as it settles, which would otherwise cut the pill short.

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
  // What the animations read as they end: the page's latest `loading`, the
  // phase they are in, and the one running, which a newer one supersedes.
  const latest = useRef({ loading, phase: "idle" as Phase, running: null as ReturnType<typeof animate> | null });

  useEffect(() => {
    const state = latest.current;
    const enter = (next: Phase, running: ReturnType<typeof animate> | null) => {
      state.phase = next;
      state.running = running;
      setPhase(next);
    };
    const blink = (left: number) => {
      const running = animate(shown, [0, 1, 0], { duration: BLINK, ease: [sine, sine] });
      enter("blink", running);
      running.then(() => {
        if (state.running !== running) return;
        if (!state.loading) enter("idle", null);
        else if (left > 1) blink(left - 1);
        else enter("sweep", animate(shown, 1, fromRest));
      });
    };

    state.loading = loading;
    if (loading) {
      // A blink or the sweep carries on. A pill still going out from its
      // sweep comes back to it.
      if (state.phase !== "idle") return;
      if (shown.get() > 0) enter("sweep", animate(shown, 1, fromRest));
      else blink(BLINKS);
    } else if (state.phase === "sweep") {
      enter("idle", animate(shown, 0, fromRest));
    }
  }, [loading]);

  // Unmounted, it stops; mounted again, it starts afresh.
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
