// A tab's loading, inspired by Arc's: a pill in the gap above the page's
// card, centred on it. As the page starts to load, the pill blinks, small.
// If the page is still loading after a couple of blinks, the pill comes
// back wider, and a line sweeps through it over and over until the page
// has loaded. Neither says how far the page has got.

import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { useEffect, useState } from "react";

type Phase = "idle" | "blink" | "sweep";

// A spring that settles without bouncing: a damping ratio of 0.92 and a
// response of 0.8s, as the stiffness and damping of a mass of 1.
const omega = (2 * Math.PI) / 0.8;
const spring = { type: "spring", stiffness: omega ** 2, damping: 2 * 0.92 * omega } as const;
// The springs on `shown` start at rest. Otherwise they carry on its
// velocity, which a blink restarting from 0 makes huge (a jump over a
// fraction of a millisecond), and fling the pill to many times its size.
const fromRest = { ...spring, velocity: 0 } as const;
// The blink: in and out, as a sine, twice, over 3.2s before it sweeps. The
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

  useEffect(() => {
    if (!loading) {
      setPhase("idle");
      const out = animate(shown, 0, fromRest);
      return () => out.stop();
    }
    let cancelled = false;
    let sweep: ReturnType<typeof animate> | undefined;
    setPhase("blink");
    const blink = animate(shown, [0, 1, 0], { duration: BLINK, ease: [sine, sine], repeat: BLINKS - 1 });
    blink.then(() => {
      if (cancelled) return;
      setPhase("sweep");
      sweep = animate(shown, 1, fromRest);
    });
    return () => {
      cancelled = true;
      blink.stop();
      sweep?.stop();
    };
  }, [loading]);

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
