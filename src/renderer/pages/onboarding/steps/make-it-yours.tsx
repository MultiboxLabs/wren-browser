// The user's first space's colour: a row of presets, and whether it is
// light, dark or as its colour makes it. The window is drawn in it as it is
// chosen, as the space's window will be. A space there already starts it
// at its own colour, which leads the row if it is none of the presets. The rest of a theme (more colours,
// intensity, noise) is the Library's to change, later.

import { CornerDownLeft } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import type { Hsb } from "@/ipc";
import { AppearanceButtons } from "@/components/theme-picker/appearance-buttons";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/utils/cn";
import { colorCss, PRESET_PAGES } from "@/utils/theme";
import { editorFor, withPrimary } from "@/utils/theme-pad";
import { type StepProps, useReturnKey } from "@/pages/onboarding/step";

// The vivid page, whose colours read best as a whole window's.
const SWATCHES = PRESET_PAGES.find(({ name }) => name === "Vivid")!.swatches;

const near = (a: number, b: number) => Math.abs(a - b) < 0.005;

const same = (a: Hsb, b: Hsb) =>
  near(a.brightness, b.brightness) && near(a.saturation, b.saturation) && (a.saturation < 0.01 || near(a.hue, b.hue));

const EASE = [0.22, 1, 0.36, 1] as const;

const rise = (order: number) => ({
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.6, delay: 0.1 + order * 0.07, ease: EASE }
});

export function MakeItYours({ choices: { theme }, choose, next, back, finishing }: StepProps) {
  useReturnKey(() => next());
  const { primary } = theme;
  // A colour that is none of the presets (the space's own, which may come
  // after the step does) stays in the row once it has been the theme's.
  const [custom, setCustom] = useState<Hsb | null>(null);
  if (!SWATCHES.some(({ color }) => same(color, primary)) && !(custom && same(custom, primary))) setCustom(primary);
  const swatches = custom ? [{ label: "Current Colour", color: custom }, ...SWATCHES] : SWATCHES;
  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-1 flex-col items-center justify-center pt-6 text-center">
        <motion.h1 {...rise(0)} className="text-onboarding-title font-bold tracking-[-0.02em]">
          Make it yours
        </motion.h1>
        <motion.p {...rise(1)} className="mt-2 text-onboarding-body text-fg-2">
          Pick a colour for your first space. You can change it any time.
        </motion.p>
        <motion.div {...rise(2)} role="radiogroup" aria-label="Colour" className="no-drag mt-10 flex gap-3">
          {swatches.map(({ label, color }) => {
            const chosen = same(color, primary);
            const css = colorCss(color);
            return (
              <Tooltip key={label} label={label}>
                <motion.button
                  type="button"
                  role="radio"
                  aria-checked={chosen}
                  aria-label={label}
                  whileTap={{ scale: 0.92 }}
                  onClick={() => choose({ theme: withPrimary({ theme, editor: editorFor(theme) }, color).theme })}
                  className={cn(
                    "size-9 rounded-full outline-offset-3",
                    chosen ? "outline-2 outline-fg" : "outline-none"
                  )}
                  // Edged by a darker ring of its own colour, as a bezel. The
                  // chosen one's mark is an outline: a ring would be a box
                  // shadow, which this takes the place of.
                  style={{
                    background: css,
                    boxShadow: `inset 0 0 0 2px color-mix(in oklab, ${css} 78%, black)`
                  }}
                />
              </Tooltip>
            );
          })}
        </motion.div>
        <motion.div {...rise(3)} className="no-drag mt-6">
          <AppearanceButtons
            appearance={theme.appearance}
            onChange={(appearance) => choose({ theme: { ...theme, appearance } })}
          />
        </motion.div>
      </div>
      <motion.footer {...rise(4)} className="flex items-center justify-between px-8 pb-7">
        <Button shape="large" className="font-medium" onClick={back}>
          Back
        </Button>
        <Button
          variant="raised"
          shape="large"
          className="gap-2.5 font-medium"
          disabled={finishing}
          onClick={() => next()}
        >
          Start Browsing
          <CornerDownLeft size={14} strokeWidth={2.25} aria-hidden className="opacity-55" />
        </Button>
      </motion.footer>
    </div>
  );
}
