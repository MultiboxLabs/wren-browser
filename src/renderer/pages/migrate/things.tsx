// What comes over, a row for each thing the source has. Choosing, each has a
// switch, and says how much of it there is; once it flies, each says how far
// it has come, then what landed.

import type { ReactNode } from "react";
import { Switch } from "@/components/ui/switch";
import type { Thing, ThingProgress } from "@/ipc";
import type { ThingSummary } from "@/state/migrate";
import { cn } from "@/utils/cn";
import { Group, Row } from "./group";
import { ThingIcon } from "./thing-icons";

const NAMES: Record<Thing, string> = {
  spaces: "Spaces",
  bookmarks: "Bookmarks",
  history: "History",
  cookies: "Stay signed in",
  extensions: "Extensions"
};

const count = (n: number) => n.toLocaleString();
const plural = (n: number, one: string, many = `${one}s`) => `${count(n)} ${n === 1 ? one : many}`;

// How much of a thing there is, as its row says it before it flies.
function detail({ thing, count: n, pins = 0 }: ThingSummary) {
  switch (thing) {
    case "spaces":
      return `${plural(n, "space")} · ${plural(pins, "pin")}`;
    case "history":
      return "The past 90 days";
    case "cookies":
      return plural(n, "site");
    default:
      return count(n);
  }
}

export function ChooseThings({
  summaries,
  isOn,
  setOn,
  extensions
}: {
  summaries: ThingSummary[];
  isOn: (thing: Thing) => boolean;
  setOn: (thing: Thing, on: boolean) => void;
  /** The extensions row's own detail: how many are chosen, and a way to choose. */
  extensions: ReactNode;
}) {
  return (
    <Group>
      {summaries.map((summary) => (
        <Row key={summary.thing} icon={<ThingIcon thing={summary.thing} size={26} />} name={NAMES[summary.thing]}>
          {summary.thing === "extensions" ? (
            extensions
          ) : (
            <span className="text-[13px] glyph-2 tabular-nums">{detail(summary)}</span>
          )}
          <Switch
            label={NAMES[summary.thing]}
            checked={isOn(summary.thing)}
            onCheckedChange={(on) => setOn(summary.thing, on)}
          />
        </Row>
      ))}
    </Group>
  );
}

export function FlyingThings({ things }: { things: ThingProgress[] }) {
  return (
    <Group>
      {things.map((each) => (
        <Row key={each.thing} icon={<ThingIcon thing={each.thing} size={26} />} name={NAMES[each.thing]}>
          <Progress progress={each} />
        </Row>
      ))}
    </Group>
  );
}

function Progress({ progress: { state, done, total, note, thing } }: { progress: ThingProgress }) {
  if (state === "waiting") return <span className="text-[13px] glyph-3">Waiting</span>;
  if (state === "flying") {
    return (
      <span className="h-1 w-30 overflow-hidden rounded-full bg-(--fill)">
        <span
          className="block h-full rounded-full bg-(--space) transition-[width] duration-300"
          style={{ width: `${total ? (done / total) * 100 : 0}%` }}
        />
      </span>
    );
  }
  const failed = state === "failed";
  return (
    <span className="flex min-w-0 flex-col items-end text-[13px] leading-tight">
      <span className={cn("tabular-nums", failed ? "text-danger" : "text-(--landed)")}>
        {failed ? "Didn’t land" : thing === "spaces" ? `${plural(done, "pin")} landed` : `${count(done)} landed`}
      </span>
      {note && <span className="truncate text-[12px] glyph-3">{note}</span>}
    </span>
  );
}
