// Whether Wren blocks ads and trackers, as it does unless the user says
// not. The choice goes to the app as onboarding finishes, which does
// nothing with it yet (onboarding.rs).

import { useState } from "react";
import { Choice } from "@/pages/onboarding/choice";
import { AdsIcon, ShieldIcon } from "@/pages/onboarding/option-icons";
import { Split } from "@/pages/onboarding/split";
import type { StepProps } from "@/pages/onboarding/step";

export function AdBlock({ choices, next, back, finishing, last }: StepProps) {
  const [on, setOn] = useState(choices.adBlock);
  return (
    <Split
      title="Fewer ads, no trackers"
      body="Wren blocks ads and the trackers that follow you from site to site, so pages load faster and what you do stays yours."
      back={back}
      go={() => next({ adBlock: on })}
      goLabel={last ? "Start Browsing" : "Continue"}
      finishing={finishing}
    >
      <div role="radiogroup" aria-label="Ad Blocker" className="flex flex-col gap-3">
        <Choice
          icon={<ShieldIcon />}
          title="Block ads and trackers"
          note="Recommended"
          body="Pages load faster, and sites can’t follow you from one to the next."
          chosen={on}
          onChoose={() => setOn(true)}
        />
        <Choice
          icon={<AdsIcon />}
          title="Show everything"
          body="Pages load as their sites made them, ads and all. You can turn blocking on later."
          chosen={!on}
          onChoose={() => setOn(false)}
        />
      </div>
    </Split>
  );
}
