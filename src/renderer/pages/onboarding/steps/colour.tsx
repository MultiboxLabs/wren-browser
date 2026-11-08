// The user's first space's colour, with the theme picker a space's is
// chosen with: its colour pad and presets, light or dark, intensity and
// noise. The window is drawn in it as it is chosen, as the space's window
// will be, so the picker's controls sit on it bare, with no box of their own.

import { motion } from "motion/react";
import { ThemePicker } from "@/components/theme-picker/theme-picker";
import { rise } from "@/pages/onboarding/rise";
import { Split } from "@/pages/onboarding/split";
import type { StepProps } from "@/pages/onboarding/step";

export function Colour({ choices: { theme }, choose, next, back, finishing, last }: StepProps) {
  return (
    <Split
      title="Add some colour"
      body="Pick one for your first space, and its window takes it on. You can change it any time."
      back={back}
      go={() => next()}
      last={last}
      finishing={finishing}
      panelClassName="items-center"
    >
      <motion.div {...rise(3)}>
        <ThemePicker value={theme} onChange={(theme) => choose({ theme })} bare />
      </motion.div>
    </Split>
  );
}
