// The user's first space's icon, with the picker every place that chooses
// one has (components/icon-picker), on a card as it is on its popover.

import { motion } from "motion/react";
import { IconPicker } from "@/components/icon-picker/icon-picker";
import { rise, Split } from "@/pages/onboarding/split";
import type { StepProps } from "@/pages/onboarding/step";

export function Icon({ choices: { icon }, choose, next, back, finishing }: StepProps) {
  return (
    <Split
      title="Give your space an icon"
      body="Spaces keep what you do apart. Pick something that says what your first one is for."
      back={back}
      go={() => next()}
      goLabel="Continue"
      finishing={finishing}
      panelClassName="items-center"
    >
      <motion.div {...rise(3)} data-scheme="system" className="popover overflow-hidden">
        <IconPicker value={icon} onChange={(icon) => choose({ icon })} />
      </motion.div>
    </Split>
  );
}
