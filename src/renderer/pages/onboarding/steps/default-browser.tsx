// Whether Wren opens the links of other apps: mail, messages, documents.
// Going on with Yes asks the system, which asks the user to confirm in a
// dialog of its own, before the next step. Once Wren is the default
// already, or where policy keeps the user from making it so, there is nothing
// to ask, and the step says where things stand, as the Library's card does.

import { Building2, CircleCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { defaultBrowser, type DefaultBrowser as State, hasApp } from "@/ipc";
import { defaultBrowserText } from "@/components/library/default-browser";
import { WrenTile } from "@/components/tile-icon";
import { Choice } from "@/pages/onboarding/choice";
import { LaterIcon } from "@/pages/onboarding/option-icons";
import { Split } from "@/pages/onboarding/split";
import type { StepProps } from "@/pages/onboarding/step";

export function DefaultBrowser({ next, back, finishing, last }: StepProps) {
  const [make, setMake] = useState(true);
  // Until the app says otherwise, one the user may make the default.
  const [state, setState] = useState<State>({ isDefault: false, canSet: true });
  const already = state.isDefault === true;
  const [asking, setAsking] = useState(false);
  useEffect(() => {
    if (!hasApp) return;
    defaultBrowser.get().then(setState, () => {});
  }, []);
  const go = () => {
    if (asking) return;
    if (!make || already || !state.canSet || !hasApp) return next();
    setAsking(true);
    // On, whether the user kept their browser or not: they were asked.
    defaultBrowser
      .set()
      .then(setState, () => {})
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
      {already || !state.canSet ? (
        <div className="flex flex-col items-center gap-3 text-center">
          {already ? (
            <CircleCheck size={40} strokeWidth={1.5} className="text-fg-2" />
          ) : (
            <Building2 size={40} strokeWidth={1.5} className="text-fg-2" />
          )}
          <p className="text-onboarding-body text-fg-2">
            {already ? "Wren is your default browser." : defaultBrowserText(state).about}
          </p>
        </div>
      ) : (
        <div role="radiogroup" aria-label="Default Browser" className="flex flex-col gap-3">
          <Choice
            icon={<WrenTile size={44} />}
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
