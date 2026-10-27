// The onboarding window (src/main/onboarding.rs): what the user goes through
// before the app is theirs, a step at a time, in the order of `STEPS`, but
// for those what they chose makes no use of (a browser whose spaces come over
// leaves no first space to make). The last step's Continue finishes it, with what the
// user chose: the window closes, and the app starts. The window starts as
// a clean slate (`Slate`); once the user picks their first space's theme,
// it is drawn in it, as that space's window will be, its blur and buttons
// too.

import { AnimatePresence, motion, MotionConfig } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { hasApp, type ImportSource, onboarding, type SpaceTheme } from "@/ipc";
import { SpaceBackground } from "@/components/space-background";
import { DEFAULT_ICON } from "@/components/space-icon";
import { TooltipProvider } from "@/components/ui/tooltip";
import { NEW_SPACE, personal, type Space } from "@/state/space";
import { useShowWindow, useSystemScheme, useWindowTheme } from "@/state/window";
import { contentScheme, defaultTheme, primaryHex } from "@/utils/theme";
import type { Choices, Step } from "./step";
import { GetStarted } from "./steps/get-started";
import { Import } from "./steps/import";
import { Icon } from "./steps/icon";
import { Colour } from "./steps/colour";
import { AdBlock } from "./steps/ad-block";
import { DefaultBrowser } from "./steps/default-browser";

// The first space's, which a browser whose spaces come over leaves none of.
const making = ({ importFrom }: Choices) => !importFrom?.spaces;
const ICON: Step = { Content: Icon, painted: false, shown: making };
const COLOUR: Step = { Content: Colour, painted: true, shown: making };

// After it, drawn in the space's theme if the user made one.
const AFTER: Step[] = [
  { Content: AdBlock, painted: making },
  { Content: DefaultBrowser, painted: making }
];

const STEPS: Step[] = [
  { Content: GetStarted, painted: false },
  { Content: Import, painted: false },
  ICON,
  COLOUR,
  ...AFTER
];

// The steps for the user, with what they have chosen.
const stepsFor = (choices: Choices) => STEPS.filter(({ shown }) => shown?.(choices) ?? true);

// How far a step slides as the next comes in, or the last comes back.
const SLIDE = 24;

// A grey with no hue, so the clean slate's text and fills are neutral.
const NEUTRAL = "#8e8e93";

const FADE = { duration: 0.35, ease: "easeOut" } as const;

export function Onboarding() {
  const [at, setAt] = useState({ index: 0, direction: 1 });
  const [choices, setChoices] = useState<Choices>({
    importFrom: null,
    icon: DEFAULT_ICON,
    theme: defaultTheme(),
    adBlock: true
  });
  const [browsers, setBrowsers] = useState<ImportSource[] | undefined>(hasApp ? undefined : []);
  // Whether the choices start where they should: the steps (and the window,
  // which shows with them) wait for it, so a picker never starts elsewhere.
  const [ready, setReady] = useState(!hasApp);
  // The first space's icon and theme, if it has them already, are where the
  // choice starts; and the browsers installed are found before their step.
  useEffect(() => {
    if (!hasApp) return;
    onboarding
      .space()
      .then(
        (space) => space && setChoices((choices) => ({ ...choices, ...space })),
        () => {}
      )
      .finally(() => setReady(true));
    onboarding.browsers().then(setBrowsers, () => setBrowsers([]));
  }, []);
  const step = stepsFor(choices)[at.index];
  const painted = typeof step.painted === "function" ? step.painted(choices) : step.painted;
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
        {ready && <Steps at={at} setAt={setAt} choices={choices} setChoices={setChoices} browsers={browsers} />}
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
  setChoices,
  browsers
}: {
  at: At;
  setAt: (at: At) => void;
  choices: Choices;
  setChoices: (choices: Choices) => void;
  browsers: ImportSource[] | undefined;
}) {
  useShowWindow();
  const [finishing, setFinishing] = useState(false);
  const choose = (change: Partial<Choices>) => setChoices({ ...choices, ...change });
  // What the step chose decides the steps after it, so they are found anew.
  const next = (change: Partial<Choices> = {}) => {
    if (finishing) return;
    const chosen = { ...choices, ...change };
    setChoices(chosen);
    const steps = stepsFor(chosen);
    if (at.index < steps.length - 1) return setAt({ index: at.index + 1, direction: 1 });
    if (!hasApp) return;
    setFinishing(true);
    // The first space's only if the user made it. Importing is to come.
    const making = steps.includes(COLOUR);
    const space = { icon: making ? chosen.icon : null, theme: making ? chosen.theme : null };
    onboarding.finish({ space, adBlock: chosen.adBlock }).catch(() => setFinishing(false));
  };
  const back = at.index > 0 ? () => setAt({ index: at.index - 1, direction: -1 }) : undefined;
  const steps = stepsFor(choices);
  const { Content } = steps[at.index];
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
          <Content
            choices={choices}
            choose={choose}
            browsers={browsers}
            next={next}
            back={back}
            finishing={finishing}
            last={at.index === steps.length - 1}
          />
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

// The window as the first space's will be, in `theme`: as the space being
// made, whose colours are drawn at once as the user picks them, not faded to
// (`themeKey`).
const themed = (theme: SpaceTheme): Space => ({
  ...personal,
  id: NEW_SPACE,
  theme,
  color: primaryHex(theme),
  scheme: contentScheme(theme)
});
