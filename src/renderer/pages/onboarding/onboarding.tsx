// The onboarding window (src/main/onboarding.rs): what the user goes through
// before the app is theirs, a step at a time, in the order of `STEPS`. The
// last step's Continue finishes it: the window closes, and the app starts.
// The window has no space: it is a clean slate (`Slate`), light or dark as
// the system is, its buttons too, so each step's content is what stands
// out.

import { AnimatePresence, motion, MotionConfig } from "motion/react";
import { useMemo, useState } from "react";
import { hasApp, onboarding } from "@/ipc";
import { personal, type Space } from "@/state/space";
import { useShowWindow, useSystemScheme, useWindowTheme } from "@/state/window";
import { defaultTheme } from "@/utils/theme";
import type { Step } from "./step";
import { GetStarted } from "./steps/get-started";

const STEPS: Step[] = [GetStarted];

// How far a step slides as the next comes in, or the last comes back.
const SLIDE = 24;

// A grey with no hue, so the text and fills made from it are neutral.
const NEUTRAL = "#8e8e93";

export function Onboarding() {
  const scheme = useSystemScheme();
  const space = useMemo<Space>(() => ({ ...personal, theme: defaultTheme(NEUTRAL), color: NEUTRAL, scheme }), [scheme]);
  useWindowTheme(space);
  return (
    // With Reduced Motion, the steps fade and do not slide.
    <MotionConfig reducedMotion="user">
      <Slate />
      <Steps />
    </MotionConfig>
  );
}

// The clean slate: over the window's blur, a veil of near white or near
// black, so what is behind the window shows through a little but does not
// colour it; and on that, a faint warm light from the top, Wren's colour.
function Slate() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0">
      <div className="absolute inset-0 bg-[rgb(248_247_245/0.72)] in-data-[scheme=dark]:bg-[rgb(31_30_29/0.72)]" />
      <div className="absolute inset-0 bg-[radial-gradient(60%_55%_at_50%_0%,rgb(255_170_90/0.18),transparent)] in-data-[scheme=dark]:bg-[radial-gradient(60%_55%_at_50%_0%,rgb(255_150_70/0.12),transparent)]" />
    </div>
  );
}

// The step the user is on, sliding in from the side they go toward.
function Steps() {
  useShowWindow();
  const [at, setAt] = useState({ index: 0, direction: 1 });
  const [finishing, setFinishing] = useState(false);
  const last = at.index === STEPS.length - 1;
  const next = () => {
    if (finishing) return;
    if (!last) return setAt({ index: at.index + 1, direction: 1 });
    if (!hasApp) return;
    setFinishing(true);
    onboarding.finish().catch(() => setFinishing(false));
  };
  const back = at.index > 0 ? () => setAt({ index: at.index - 1, direction: -1 }) : undefined;
  const Current = STEPS[at.index];
  return (
    <div className="drag relative h-full overflow-hidden">
      <AnimatePresence mode="wait" initial={false} custom={at.direction}>
        <motion.div
          key={at.index}
          custom={at.direction}
          variants={{
            enter: (direction: number) => ({ opacity: 0, x: direction * SLIDE }),
            shown: { opacity: 1, x: 0 },
            leave: (direction: number) => ({ opacity: 0, x: -direction * SLIDE })
          }}
          initial="enter"
          animate="shown"
          exit="leave"
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="absolute inset-0"
        >
          <Current next={next} back={back} last={last} finishing={finishing} />
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
