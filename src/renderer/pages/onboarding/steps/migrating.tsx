// The run that brings the user's things over (src/main/import/run.rs), as it
// goes: each thing's progress, then what landed. Once it is done, Continue
// goes on to the rest of onboarding. If it stopped before bringing anything,
// as when the browser could not be read or a profile could not be made, the
// user may try again from the import step, or skip it and start fresh.

import { ThingIcon } from "@/components/migrate/thing-icons";
import { landedText, NAMES } from "@/components/migrate/thing-text";
import type { ThingProgress } from "@/ipc";
import { cn } from "@/utils/cn";
import { Group, GroupRow } from "@/pages/onboarding/group";
import { Split } from "@/pages/onboarding/split";
import type { StepProps } from "@/pages/onboarding/step";
import { Import } from "./import";

export function Migrating({ migrate, next, backTo, finishing, last }: StepProps) {
  const { phase, run, error } = migrate;
  const name = migrate.source?.name ?? "your browser";
  // The run shows once it has started; until then, and if it could not
  // start, there is none.
  const shown = phase === "flying" || phase === "landed" ? run : null;
  const stopped = !!error || !!shown?.stopped;
  const done = !stopped && !!shown?.finished;
  const failed = shown?.things.some(({ state }) => state === "failed");

  if (stopped) {
    const why = error ?? shown?.things.find(({ note }) => note)?.note;
    return (
      <Split
        title="Nothing came over"
        body={`Wren could not bring your things over from ${name}.${why ? ` ${why}` : ""}`}
        back={() => next({ importFrom: null, spaces: false })}
        backLabel="Skip"
        go={() => backTo(Import)}
        goLabel="Try Again"
        last={last}
        finishing={finishing}
      >
        {shown && <Things things={shown.things} />}
      </Split>
    );
  }
  return (
    <Split
      title={done ? (failed ? "Most of it has landed" : "Everything has landed") : "Bringing your things over"}
      body={
        done
          ? `Your things from ${name} are in Wren now.`
          : `From ${name}. Keep this window open until everything has landed.`
      }
      go={() => next()}
      canGo={done}
      last={last}
      finishing={finishing}
    >
      {shown && <Things things={shown.things} />}
    </Split>
  );
}

function Things({ things }: { things: ThingProgress[] }) {
  return (
    <Group>
      {things.map((each) => (
        <GroupRow key={each.thing} icon={<ThingIcon thing={each.thing} size={26} />} name={NAMES[each.thing]}>
          <Progress progress={each} />
        </GroupRow>
      ))}
    </Group>
  );
}

function Progress({ progress: { state, done, total, note, thing } }: { progress: ThingProgress }) {
  if (state === "waiting") return <span className="text-subtitle text-fg-3">Waiting</span>;
  if (state === "flying") {
    return (
      <span className="h-1 w-30 overflow-hidden rounded-full bg-fill">
        <span
          className="block h-full rounded-full bg-fg-2 transition-[width] duration-300"
          style={{ width: `${total ? (done / total) * 100 : 0}%` }}
        />
      </span>
    );
  }
  const failed = state === "failed";
  return (
    <span className="flex min-w-0 flex-col items-end text-subtitle leading-tight">
      <span className={cn("tabular-nums", failed ? "text-danger" : "text-fg-2")}>
        {failed ? "Didn’t land" : landedText(thing, done)}
      </span>
      {note && <span className="truncate text-fg-3">{note}</span>}
    </span>
  );
}
