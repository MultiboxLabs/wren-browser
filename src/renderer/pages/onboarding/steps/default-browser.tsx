// Whether Wren opens the links of other apps: mail, messages, documents.
// Going on with Yes asks the system, which asks the user to confirm in a
// dialog of its own, before the next step. Once Wren is the default
// already, there is nothing to ask.

import { CircleCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { defaultBrowser, hasApp } from "@/ipc";
import { Choice } from "@/pages/onboarding/choice";
import { LaterIcon, WrenIcon } from "@/pages/onboarding/option-icons";
import { Split } from "@/pages/onboarding/split";
import type { StepProps } from "@/pages/onboarding/step";

export function DefaultBrowser({ next, back, finishing, last }: StepProps) {
  const [make, setMake] = useState(true);
  // Whether it is already; undefined until the app has said.
  const [already, setAlready] = useState<boolean | undefined>(hasApp ? undefined : false);
  // Policy may keep the user from making it so: then there is nothing to ask.
  const [canSet, setCanSet] = useState(hasApp);
  const [asking, setAsking] = useState(false);
  useEffect(() => {
    if (!hasApp) return;
    defaultBrowser.get().then(
      ({ isDefault, canSet }) => {
        setAlready(isDefault === true);
        setCanSet(canSet);
      },
      () => setAlready(false)
    );
  }, []);
  const go = () => {
    if (asking) return;
    if (!make || already || !canSet) return next();
    setAsking(true);
    // On, whether the user kept their browser or not: they were asked.
    defaultBrowser
      .set()
      .then(
        ({ isDefault }) => setAlready(isDefault === true),
        () => {}
      )
      .finally(() => {
        setAsking(false);
        next();
      });
  };
  return (
    <Split
      title="Make Wren your browser"
      body="Links you open from mail, messages and other apps open here, in the space you were in."
      back={back}
      go={go}
      goLabel={last ? "Start Browsing" : "Continue"}
      finishing={finishing || asking}
    >
      {already ? (
        <div className="flex flex-col items-center gap-3 text-center">
          <CircleCheck size={40} strokeWidth={1.5} className="text-fg-2" />
          <p className="text-onboarding-body text-fg-2">Wren is your default browser.</p>
        </div>
      ) : (
        <div role="radiogroup" aria-label="Default Browser" className="flex flex-col gap-3">
          <Choice
            icon={<WrenIcon />}
            title="Make Wren my default"
            body="Links from Mail, Messages and your other apps open in Wren. macOS asks you to confirm."
            chosen={make}
            onChoose={() => setMake(true)}
          />
          <Choice
            icon={<LaterIcon />}
            title="Not now"
            body="Links keep opening where they do now. You can change it any time in System Settings."
            chosen={!make}
            onChoose={() => setMake(false)}
          />
        </div>
      )}
    </Split>
  );
}
