// The onboarding window (src/main/onboarding.rs): what the user goes through
// before the app is theirs, a step at a time, in the order of `STEPS`, but
// for those what they chose makes no use of (starting fresh brings nothing
// over, and spaces that come over bring their own icons and colours, so the
// first space's are not asked for). Bringing things over runs as soon as
// the user has chosen what comes, as on wren://migrate (`useMigrate`). The
// last step's button finishes it, with what the user chose: the window
// closes, and the app starts. The window starts as a clean slate (`Slate`);
// once the user picks their first space's theme, it is drawn in it, as that
// space's window will be, its blur and buttons too.

import { AnimatePresence, motion, MotionConfig } from "motion/react";
import { useMemo, useState } from "react";
import { hasApp, onboarding, onboardingMigrate, type SpaceTheme } from "@/ipc";
import { SpaceBackground } from "@/components/space-background";
import { DEFAULT_ICON } from "@/components/space-icon";
import { TooltipProvider } from "@/components/ui/tooltip";
import { type MigrateState, useMigrate } from "@/state/migrate";
import { NEW_SPACE, personal, type Space } from "@/state/space";
import { useShowWindow, useSystemScheme, useWindowTheme } from "@/state/window";
import { contentScheme, defaultTheme, primaryHex } from "@/utils/theme";
import type { Choices, Step } from "./step";
import { GetStarted } from "./steps/get-started";
import { Import } from "./steps/import";
import { Bring } from "./steps/bring";
import { Migrating } from "./steps/migrating";
import { Icon } from "./steps/icon";
import { Colour } from "./steps/colour";
import { AdBlock } from "./steps/ad-block";
import { DefaultBrowser } from "./steps/default-browser";

// What comes over, and its run, only from a browser.
const importing = ({ importFrom }: Choices) => !!importFrom;

// The first space's icon and colour, unless spaces came over with their own.
const making = ({ spaces }: Choices) => !spaces;

// From the colour on, drawn in the space's theme, if the user chose one.
const STEPS: Step[] = [
  { Content: GetStarted, painted: false },
  { Content: Import, painted: false },
  { Content: Bring, painted: false, shown: importing },
  { Content: Migrating, painted: false, shown: importing },
  { Content: Icon, painted: false, shown: making },
  { Content: Colour, painted: true, shown: making },
  { Content: AdBlock, painted: making },
  { Content: DefaultBrowser, painted: making }
];

// Whether `step` is drawn in the chosen theme, with what the user chose.
const paintedFor = (step: Step, choices: Choices) =>
  typeof step.painted === "function" ? step.painted(choices) : step.painted;

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
    spaces: false,
    icon: DEFAULT_ICON,
    theme: defaultTheme(),
    adBlock: true
  });
  const migrate = useMigrate(onboardingMigrate);
  const step = stepsFor(choices)[at.index];
  const painted = paintedFor(step, choices);
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
        <Steps at={at} setAt={setAt} choices={choices} setChoices={setChoices} migrate={migrate} />
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
      <div className="absolute inset-0 bg-(--slate-veil)" />
      <div className="absolute inset-0 bg-[radial-gradient(60%_55%_at_50%_0%,var(--slate-glow),transparent)]" />
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
  migrate
}: {
  at: At;
  setAt: (at: At) => void;
  choices: Choices;
  setChoices: (choices: Choices) => void;
  migrate: MigrateState;
}) {
  useShowWindow();
  const [finishing, setFinishing] = useState(false);
  const choose = (change: Partial<Choices>) => setChoices({ ...choices, ...change });
  const steps = stepsFor(choices);
  // What the step chose decides the steps after it, so they are found anew.
  // The next is the first after this one in `STEPS` that is for the user,
  // whether this one still is or not (Skip leaves the run's behind).
  const next = (change: Partial<Choices> = {}) => {
    if (finishing) return;
    const chosen = { ...choices, ...change };
    setChoices(chosen);
    const here = STEPS.indexOf(steps[at.index]);
    const after = stepsFor(chosen);
    const index = after.filter((step) => STEPS.indexOf(step) <= here).length;
    if (index < after.length) return setAt({ index, direction: 1 });
    if (!hasApp) return;
    setFinishing(true);
    // The first space's only if the user made it.
    const space = chosen.spaces ? { icon: null, theme: null } : { icon: chosen.icon, theme: chosen.theme };
    onboarding.finish({ space, adBlock: chosen.adBlock }).catch(() => setFinishing(false));
  };
  const back = at.index > 0 ? () => setAt({ index: at.index - 1, direction: -1 }) : undefined;
  const backTo = (Content: Step["Content"]) => {
    const index = steps.findIndex((step) => step.Content === Content);
    if (index >= 0) setAt({ index, direction: -1 });
  };
  const { Content } = steps[at.index];
  const painted = paintedFor(steps[at.index], choices);
  return (
    // On the clean slate, a switch takes the slate's warm light (onboarding.css).
    // Clipped, not hidden: a field that takes focus while its step slides in,
    // partly past the window's edge, would scroll a hidden overflow to show it.
    <div data-slate={!painted || undefined} className="drag relative h-full overflow-clip">
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
            migrate={migrate}
            next={next}
            back={back}
            backTo={backTo}
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
// made, whose colours are drawn at once as the user picks them, not tweened
// to (`themeKey`).
const themed = (theme: SpaceTheme): Space => ({
  ...personal,
  id: NEW_SPACE,
  theme,
  color: primaryHex(theme),
  scheme: contentScheme(theme)
});
