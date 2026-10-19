// The Library's lists: its profiles, their spaces under each, and the boosts.
// Each row is a tile and two lines, selected on press as a native list's.

import { Orbit, Power } from "lucide-react";
import { motion } from "motion/react";
import { type ReactNode, useState } from "react";
import { Button } from "../ui/button";
import { press } from "../ui/press";
import { Favicon } from "../favicon";
import { type Boost, boosts as allBoosts, profiles, spaces } from "../../state/library";
import { useSpace } from "../../state/space";
import { cssColor } from "../../utils/color";
import { cn } from "../../utils/cn";

export type Section = "profiles" | "spaces" | "boosts";

const plural = (count: number, one: string) => `${count} ${one}${count === 1 ? "" : "s"}`;

/** Whether `query`, already lowercased, is in any of `texts`. */
const matches = (query: string, ...texts: (string | undefined)[]) =>
  texts.some((text) => text?.toLowerCase().includes(query));

/** The section's list, searched by `query`, which is lowercased. */
export function SectionList({ section, query }: { section: Section; query: string }) {
  const [selected, setSelected] = useState<string | null>(null);
  const list =
    section === "profiles" ? (
      <Profiles query={query} selected={selected} onSelect={setSelected} />
    ) : section === "spaces" ? (
      <Spaces query={query} selected={selected} onSelect={setSelected} />
    ) : (
      <Boosts query={query} selected={selected} onSelect={setSelected} />
    );
  return <div className="-mr-2 mt-1.75 min-h-0 flex-1 overflow-y-auto pr-2 [scrollbar-width:none]">{list}</div>;
}

type ListProps = { query: string; selected: string | null; onSelect: (id: string) => void };

function Profiles({ query, selected, onSelect }: ListProps) {
  const shown = profiles.filter((profile) => matches(query, profile.name, profile.account));
  if (shown.length === 0) return <Empty>No Profiles Found</Empty>;
  return (
    <div className="flex flex-col gap-0.5">
      {shown.map((profile) => (
        <Row
          key={profile.id}
          selected={profile.id === selected}
          onPress={() => onSelect(profile.id)}
          tile={
            <span
              className="grid size-9 place-items-center rounded-full text-[15px] font-semibold text-white"
              style={{ background: cssColor(profile.color) }}
            >
              {profile.name[0]}
            </span>
          }
          title={profile.name}
          subtitle={`${profile.account ?? "Not signed in"} · ${plural(
            spaces.filter((space) => space.profile === profile.id).length,
            "space"
          )}`}
        />
      ))}
    </div>
  );
}

function Spaces({ query, selected, onSelect }: ListProps) {
  const current = useSpace().space.id;
  const groups = profiles
    .map((profile) => ({
      profile,
      spaces: spaces.filter(
        (space) => space.profile === profile.id && (matches(query, space.name) || matches(query, profile.name))
      )
    }))
    .filter((group) => group.spaces.length > 0);
  if (groups.length === 0) return <Empty>No Spaces Found</Empty>;
  return (
    <div className="flex flex-col gap-2">
      {groups.map(({ profile, spaces }) => (
        <section key={profile.id} className="flex flex-col gap-0.5">
          <h3 className="flex h-6 items-center pl-2.5 text-caption font-semibold text-fg-3">{profile.name}</h3>
          {spaces.map((space) => (
            <Row
              key={space.id}
              selected={space.id === selected}
              onPress={() => onSelect(space.id)}
              tile={
                <span
                  className="grid size-9 place-items-center rounded-[9px] text-white"
                  style={{ background: cssColor(space.color) }}
                >
                  <Orbit size={18} strokeWidth={2} />
                </span>
              }
              title={space.name}
              subtitle={space.id === current ? `${plural(space.tabs, "tab")} · Shown` : plural(space.tabs, "tab")}
            />
          ))}
        </section>
      ))}
    </div>
  );
}

function Boosts({ query, selected, onSelect }: ListProps) {
  // Made up, so turning one on or off lasts until another section is chosen.
  const [boosts, setBoosts] = useState(allBoosts);
  const toggle = (boost: Boost) =>
    setBoosts((boosts) => boosts.map((each) => (each === boost ? { ...boost, on: !boost.on } : each)));
  const shown = boosts.filter((boost) => matches(query, boost.name, boost.host));
  if (shown.length === 0) return <Empty>No Boosts Found</Empty>;
  return (
    <div className="flex flex-col gap-0.5">
      {shown.map((boost) => (
        <Row
          key={boost.id}
          selected={boost.id === selected}
          onPress={() => onSelect(boost.id)}
          tile={<BoostTile boost={boost} />}
          title={boost.name}
          subtitle={boost.host}
          dim={!boost.on}
          trailing={
            <Button
              icon={Power}
              iconSize={14}
              label={boost.on ? "Turn Off" : "Turn On"}
              pressed={boost.on}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => toggle(boost)}
              className="size-6 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
            />
          }
        />
      ))}
    </div>
  );
}

// The site's icon on a light tile, as Arc shows a boost. Off, the tile is
// faint, and struck through in the space's colour.
function BoostTile({ boost }: { boost: Boost }) {
  return (
    <span
      className={cn(
        "relative grid size-9 place-items-center rounded-[9px] shadow-[0_0_0_1.5px_rgb(255_255_255/0.35)]",
        boost.on ? "bg-[rgb(246_246_246)]" : "bg-white/30"
      )}
    >
      <span className={cn("grid", !boost.on && "opacity-40")}>
        <Favicon url={`https://${boost.host}/`} title={boost.host.replace(/^www\./, "")} size={20} />
      </span>
      {!boost.on && (
        <svg aria-hidden viewBox="0 0 36 36" className="absolute -inset-0.5 size-10">
          <path d="M3 3 33 33" stroke="rgb(255 255 255 / 0.45)" strokeWidth="5.5" strokeLinecap="round" />
          <path
            d="M3 3 33 33"
            style={{ stroke: "oklch(from var(--space) 0.38 calc(c * 0.9) h)" }}
            strokeWidth="3"
            strokeLinecap="round"
          />
        </svg>
      )}
    </span>
  );
}

function Row({
  selected,
  dim,
  onPress,
  tile,
  title,
  subtitle,
  trailing
}: {
  selected: boolean;
  /** Off: its text is fainter (its tile shows it by itself). */
  dim?: boolean;
  onPress: () => void;
  tile: ReactNode;
  title: string;
  subtitle: string;
  trailing?: ReactNode;
}) {
  return (
    <motion.div
      {...press(0.985)}
      role="button"
      tabIndex={-1}
      aria-pressed={selected}
      onPointerDown={(event) => event.button === 0 && onPress()}
      className={cn(
        "no-drag group flex h-12.5 shrink-0 items-center gap-3 rounded-row pr-1.5 pl-1.5",
        selected ? "bg-selected" : "hover:bg-hover"
      )}
    >
      <span className="shrink-0">{tile}</span>
      <span className={cn("flex min-w-0 flex-1 flex-col gap-0.5", dim && "opacity-70")}>
        <span className="truncate">{title}</span>
        <span className="truncate text-subtitle text-fg-2">{subtitle}</span>
      </span>
      {trailing}
    </motion.div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="pt-10 text-center text-fg-3">{children}</p>;
}
