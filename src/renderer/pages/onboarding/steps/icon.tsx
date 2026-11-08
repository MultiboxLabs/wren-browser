// The user's first space's icon, with the picker every place that chooses
// one has (components/icon-picker), straight on the step, as the colour
// step's picker is.

import { motion } from "motion/react";
import { IconPicker } from "@/components/icon-picker/icon-picker";
import { rise } from "@/pages/onboarding/rise";
import { Split } from "@/pages/onboarding/split";
import type { StepProps } from "@/pages/onboarding/step";

export function Icon({ choices: { icon }, choose, next, back, finishing, last }: StepProps) {
  return (
    <Split
      title="Give your space an icon"
      body="Spaces keep what you do apart. Pick something that says what your first one is for."
      back={back}
      go={() => next()}
      last={last}
      finishing={finishing}
      // The whole half, to its edges, top and foot: `pr-8` is the part that
      // runs past the window's edge (split.tsx).
      panelClassName="pl-0 pr-8"
    >
      <motion.div {...rise(3)} className="min-h-0 flex-1">
        <IconPicker value={icon} onChange={(icon) => choose({ icon })} className="size-full" />
      </motion.div>
    </Split>
  );
}
