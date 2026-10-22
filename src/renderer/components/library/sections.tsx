// The Library's list for a section: the profiles', the spaces' and the boosts'.

import { Power } from "lucide-react";
import { useState } from "react";
import { Button } from "../ui/button";
import { Favicon } from "../favicon";
import { type Boost, boosts as allBoosts } from "../../state/library";
import { cn } from "../../utils/cn";
import { Profiles, type ProfilesProps } from "./profiles";
import { Empty, type ListProps, matches, Row } from "./rows";
import { Spaces, type SpacesProps } from "./spaces";

export type Section = "profiles" | "spaces" | "boosts";

export type SectionListProps = ProfilesProps &
  SpacesProps & {
    section: Section;
    /** Lowercased. */
    query: string;
    /** The row chosen, by its ID; the app's rows are the section's own. */
    selected: string | null;
    onSelect: (id: string | null) => void;
  };

/** The section's list, searched by `query`. */
export function SectionList({
  section,
  query,
  selected,
  onSelect,
  spaces,
  spacesFailed,
  onReloadSpaces,
  onUpdateSpace,
  onDeleteSpace,
  ...profileProps
}: SectionListProps) {
  const list =
    section === "profiles" ? (
      <Profiles {...profileProps} query={query} selected={selected} onSelect={onSelect} />
    ) : section === "spaces" ? (
      <Spaces
        query={query}
        selected={selected}
        onSelect={onSelect}
        profiles={profileProps.profiles}
        spaces={spaces}
        failed={profileProps.failed || spacesFailed}
        onReload={() => {
          profileProps.onReload();
          onReloadSpaces();
        }}
        onUpdateSpace={onUpdateSpace}
        onDeleteSpace={onDeleteSpace}
      />
    ) : (
      <Boosts query={query} selected={selected} onSelect={onSelect} />
    );
  return <div className="-mr-2 mt-1.75 min-h-0 flex-1 overflow-y-auto pr-2 scrollbar-none">{list}</div>;
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
