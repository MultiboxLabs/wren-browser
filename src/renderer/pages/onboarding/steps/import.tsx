// Bringing the user's things over from the browser they use now: the
// browsers installed, with Start Fresh after them to bring nothing. One that
// keeps spaces brings them, so the user is not asked to make one after.
// Only the choice is kept for now: nothing is imported yet.

import { useState } from "react";
import { iconUrl } from "@/ipc";
import { cn } from "@/utils/cn";
import { FreshIcon } from "@/pages/onboarding/option-icons";
import { Row } from "@/pages/onboarding/row";
import { Split } from "@/pages/onboarding/split";
import type { StepProps } from "@/pages/onboarding/step";

// How many rows the list shows whole (rows h-14, gap-2.5, Start Fresh's
// mt-2, in the window's height less py-6); one more, and it scrolls.
const FITS = 9;

// Start Fresh's row, among the browsers'.
const FRESH = "fresh";

export function Import({ choices, browsers, next, back, finishing }: StepProps) {
  const list = browsers ?? [];
  // The row the user chose, here or before; or else, as the list comes, the
  // first browser that keeps spaces, or the first.
  const [picked, setPicked] = useState(choices.importFrom?.id);
  const source =
    picked === FRESH
      ? undefined
      : (list.find(({ id }) => id === picked) ?? list.find(({ spaces }) => spaces) ?? list[0]);
  const rows = list.length + 1;
  return (
    <Split
      title="Bring your things over"
      body="Your spaces, bookmarks and history, from the browser you use now."
      back={back}
      go={() => next({ importFrom: source ?? null })}
      goLabel={source ? `Import from ${source.name}` : "Continue"}
      finishing={finishing}
    >
      <div
        role="radiogroup"
        aria-label="Browser"
        className={cn(
          "-mx-2 flex max-h-full flex-col gap-2.5 overflow-y-auto px-2 py-6 scrollbar-none",
          // A list longer than the window fades at the bottom, to show it goes on.
          rows > FITS && "mask-b-from-85%"
        )}
      >
        {list.map((browser) => (
          <Row
            key={browser.id}
            icon={<img src={iconUrl(browser.icon)} alt="" className="size-10" />}
            name={browser.name}
            detail={browser.spaces ? "Includes your spaces" : undefined}
            chosen={browser === source}
            onChoose={() => setPicked(browser.id)}
          />
        ))}
        {browsers && (
          <Row
            icon={
              // As large as an app's icon is inside its box, beside them.
              <span className="grid size-10 place-items-center">
                <FreshIcon size={33} />
              </span>
            }
            className="mt-2"
            name="Start fresh"
            detail="Bring nothing over"
            chosen={!source}
            onChoose={() => setPicked(FRESH)}
          />
        )}
      </div>
    </Split>
  );
}
