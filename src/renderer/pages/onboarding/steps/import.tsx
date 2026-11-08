// Bringing the user's things over from the browser they use now: the
// browsers installed with something to bring, as wren://migrate lists them,
// with Start Fresh after them to bring nothing. Picking one reads what its
// profiles have, for the next step to choose from (bring.tsx).

import { useState } from "react";
import { SourceIcon } from "@/components/migrate/source-icon";
import { cn } from "@/utils/cn";
import { FreshIcon } from "@/pages/onboarding/option-icons";
import { Row } from "@/pages/onboarding/row";
import { Split } from "@/pages/onboarding/split";
import type { StepProps } from "@/pages/onboarding/step";

// How many rows the list shows whole (rows h-14, gap-2.5, Start Fresh's
// mt-2, in the window's height less py-6); one more, and it scrolls.
const FITS = 9;

export function Import({ choices, migrate, next, back, finishing, last }: StepProps) {
  const list = migrate.sources ?? [];
  // Start Fresh, if the user chose it before; or else the browser the state
  // has, which starts as the first that keeps spaces, or the first.
  const [fresh, setFresh] = useState(choices.importFrom === null);
  const source = fresh ? undefined : migrate.source;
  const rows = list.length + 1;
  return (
    <Split
      title="Bring your things over"
      body="Your spaces, bookmarks and history, from the browser you use now."
      back={back}
      go={() => next({ importFrom: source ?? null, spaces: false })}
      goLabel={source && `Import from ${source.name}`}
      canGo={!!migrate.sources || !!migrate.error}
      last={last}
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
            icon={<SourceIcon source={browser} size={40} />}
            name={browser.name}
            detail={browser.keepsSpaces ? "Includes your spaces" : undefined}
            chosen={browser === source}
            onChoose={() => {
              setFresh(false);
              migrate.chooseSource(browser.id);
            }}
          />
        ))}
        {(migrate.sources || migrate.error) && (
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
            onChoose={() => setFresh(true)}
          />
        )}
      </div>
    </Split>
  );
}
