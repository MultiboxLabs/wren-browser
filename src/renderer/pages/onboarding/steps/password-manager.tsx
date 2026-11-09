// Whether the user keeps their passwords in Wren's password manager, on
// unless they say not, or in another of their own. The choice goes to the
// app as onboarding finishes, which keeps it as the Password Manager setting
// and turns it on or off in every profile (onboarding.rs).

import { useState } from "react";
import { Choice } from "@/pages/onboarding/choice";
import { KeyIcon, NoKeyIcon } from "@/pages/onboarding/option-icons";
import { Split } from "@/pages/onboarding/split";
import type { StepProps } from "@/pages/onboarding/step";

export function PasswordManager({ choices, next, back, finishing, last }: StepProps) {
  const [on, setOn] = useState(choices.passwordManager);
  return (
    <Split
      title="Wren’s password manager"
      body="Wren can save the passwords you sign in with and fill them in next time. Each profile keeps its own."
      back={back}
      go={() => next({ passwordManager: on })}
      last={last}
      finishing={finishing}
    >
      <div role="radiogroup" aria-label="Password Manager" className="flex flex-col gap-3">
        <Choice
          icon={<KeyIcon />}
          title="Use Wren’s password manager"
          body="Wren offers to save a password when you sign in to a site, and fills it in when you come back."
          chosen={on}
          onChoose={() => setOn(true)}
        />
        <Choice
          icon={<NoKeyIcon />}
          title="Use another password manager"
          body="Wren won’t offer to save passwords or fill them in, so only yours does. You can turn Wren’s on later in Settings."
          chosen={!on}
          onChoose={() => setOn(false)}
        />
      </div>
    </Split>
  );
}
