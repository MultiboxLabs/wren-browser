// What the window shows as it opens on a new version of Wren: a sheen of
// light that sweeps up over the whole of it, and the window's edge lit where
// the sheen passes. Both are added to what is under them (plus-lighter), so
// they show on a light space as on a dark one, and take nothing away.

import { animate, motion, type MotionStyle, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { useEffect, useState } from "react";
import { useUpdated } from "../state/update";

// How long it sweeps, after how long, in seconds.
const DURATION = 1.1;
const DELAY = 0.15;
// The sheen's height, as a share of the window's.
const BAND = 0.7;

export function Updated() {
  const updated = useUpdated();
  // Anew each time, so a second update plays it from the start.
  return updated > 0 ? <Sweep key={updated} /> : null;
}

function Sweep() {
  const still = useReducedMotion();
  const [done, setDone] = useState(false);
  // From 0, the sheen below the window, to 1, above it. The sheen and the
  // edge's light are both placed by it, so they keep together.
  const progress = useMotionValue(0);
  useEffect(() => {
    if (still) return;
    const sweep = animate(progress, 1, { duration: DURATION, delay: DELAY, ease: [0.4, 0, 0.2, 1] });
    void sweep.then(() => setDone(true));
    return () => sweep.stop();
  }, []);

  // In and out at the window's ends, so it never starts or stops sharply.
  const opacity = useTransform(progress, [0, 0.15, 0.8, 1], [0, 1, 1, 0]);
  const y = useTransform(progress, [0, 1], [`100vh`, `-${BAND * 100}vh`]);
  // The sheen's middle, where the edge is lit.
  const middle = useTransform(progress, [0, 1], [`${100 + (BAND * 100) / 2}%`, `-${(BAND * 100) / 2}%`]);

  if (done) return null;
  // With Reduced Motion, nothing moves: the edge alone glows and fades.
  if (still)
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 1, 0] }}
        transition={{ duration: DURATION, delay: DELAY }}
        onAnimationComplete={() => setDone(true)}
        style={{ "--middle": "50%" } as MotionStyle}
        className="updated-edge"
      />
    );
  return (
    <>
      <motion.div style={{ y, opacity, height: `${BAND * 100}vh` }} className="updated-sheen" />
      <motion.div style={{ opacity, "--middle": middle } as MotionStyle} className="updated-edge" />
    </>
  );
}
