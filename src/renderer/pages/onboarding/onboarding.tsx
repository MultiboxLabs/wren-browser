// The onboarding window (src/main/onboarding.rs): what the user goes through
// before the app is theirs, a step at a time, in the order of `STEPS`. The
// last step's Continue finishes it, with what the user chose: the window
// closes, and the app starts. The window starts as a clean slate (`Slate`);
// once the user picks their first space's theme, it is drawn in it, as that
// space's window will be, its blur and buttons too.

import { AnimatePresence, motion, MotionConfig } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { hasApp, onboarding, type OnboardingChoices, type SpaceTheme } from "@/ipc";
import { SpaceBackground } from "@/components/space-background";
import { TooltipProvider } from "@/components/ui/tooltip";
import { personal, type Space } from "@/state/space";
import { useShowWindow, useSystemScheme, useWindowTheme } from "@/state/window";
import { contentScheme, defaultTheme, primaryHex } from "@/utils/theme";
import type { Step } from "./step";
import { GetStarted } from "./steps/get-started";
import { MakeItYours } from "./steps/make-it-yours";

const STEPS: Step[] = [
  { Content: GetStarted, painted: false },
  { Content: MakeItYours, painted: true }
];

// How far a step slides as the next comes in, or the last comes back.
const SLIDE = 24;

// A grey with no hue, so the clean slate's text and fills are neutral.
const NEUTRAL = "#8e8e93";

const FADE = { duration: 0.35, ease: "easeOut" } as const;

export function Onboarding() {
  const [at, setAt] = useState({ index: 0, direction: 1 });
  const [choices, setChoices] = useState<OnboardingChoices>({ theme: defaultTheme() });
  // The first space's theme, if it has one already, is where the choice starts.
  useEffect(() => {
    if (!hasApp) return;
    onboarding.theme().then(
      (theme) => theme && setChoices((choices) => ({ ...choices, theme })),
      () => {}
    );
  }, []);
  const { painted } = STEPS[at.index];
  const scheme = useSystemScheme();
  const space = useMemo(() => (painted ? themed(choices.theme) : neutral(scheme)), [painted, choices.theme, scheme]);
  useWindowTheme(space);
  return (
    // With Reduced Motion, the steps fade and do not slide.
    <MotionConfig reducedMotion="user">
      <TooltipProvider>
        <AnimatePresence initial={false}>
          {painted ? (
            <motion.div
              key="painted"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={FADE}
            >
              <SpaceBackground space={space} className="fixed inset-0" />
            </motion.div>
          ) : (
            <motion.div
              key="slate"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={FADE}
            >
              <Slate />
            </motion.div>
          )}
        </AnimatePresence>
        <Steps
          at={at}
          setAt={setAt}
          choices={choices}
          choose={(change) => setChoices((choices) => ({ ...choices, ...change }))}
        />
      </TooltipProvider>
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

type At = { index: number; direction: number };

// The step the user is on, sliding in from the side they go toward.
function Steps({
  at,
  setAt,
  choices,
  choose
}: {
  at: At;
  setAt: (at: At) => void;
  choices: OnboardingChoices;
  choose: (change: Partial<OnboardingChoices>) => void;
}) {
  useShowWindow();
  const [finishing, setFinishing] = useState(false);
  const last = at.index === STEPS.length - 1;
  const next = () => {
    if (finishing) return;
    if (!last) return setAt({ index: at.index + 1, direction: 1 });
    if (!hasApp) return;
    setFinishing(true);
    onboarding.finish(choices).catch(() => setFinishing(false));
  };
  const back = at.index > 0 ? () => setAt({ index: at.index - 1, direction: -1 }) : undefined;
  const { Content } = STEPS[at.index];
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
          <Content choices={choices} choose={choose} next={next} back={back} last={last} finishing={finishing} />
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// The clean slate: the system's light or dark, with neutral text.
const neutral = (scheme: "light" | "dark"): Space => ({
  ...personal,
  theme: defaultTheme(NEUTRAL),
  color: NEUTRAL,
  scheme
});

// The window as the first space's will be, in `theme`.
const themed = (theme: SpaceTheme): Space => ({
  ...personal,
  theme,
  color: primaryHex(theme),
  scheme: contentScheme(theme)
});
