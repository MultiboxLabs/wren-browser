// The Library's lists: its profiles, the spaces under their owners, and the
// boosts. Each row is a tile and two lines, selected on press as a native
// list's.

import { LoaderCircle, Orbit, Pencil, Plus, Power, Trash2 } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Button, type Icon as IconType } from "../ui/button";
import { press } from "../ui/press";
import { Favicon } from "../favicon";
import { DeleteDialog, RenameDialog } from "./profile-dialogs";
import { type Boost, boosts as allBoosts, type Profile, spaceOwners, spaces } from "../../state/library";
import { useSpace } from "../../state/space";
import { cssColor } from "../../utils/color";
import { cn } from "../../utils/cn";

export type Section = "profiles" | "spaces" | "boosts";

const plural = (count: number, one: string) => `${count} ${one}${count === 1 ? "" : "s"}`;

/** Whether `query`, already lowercased, is in any of `texts`. */
const matches = (query: string, ...texts: (string | undefined)[]) =>
  texts.some((text) => text?.toLowerCase().includes(query));

export type SectionListProps = {
  section: Section;
  /** Lowercased. */
  query: string;
  /** Null until the app has listed them. */
  profiles: Profile[] | null;
  /** The app could not list them. */
  failed: boolean;
  /** Asks it to list them again. */
  onReload: () => void;
  /** A new profile is being named, in a row at the top of the profiles. */
  naming: boolean;
  /** Makes the profile; rejects if it can't be made. */
  onCreate: (name: string) => Promise<void>;
  /** The profile is named no more: made, or given up. */
  onNamed: () => void;
  /** Renames the profile; rejects if it can't be renamed. */
  onRename: (id: string, name: string) => Promise<void>;
  /** Deletes the profile; rejects if it can't be deleted. */
  onDelete: (id: string) => Promise<void>;
};

type ProfileProps = Pick<
  SectionListProps,
  "profiles" | "failed" | "onReload" | "naming" | "onCreate" | "onNamed" | "onRename" | "onDelete"
>;

/** The section's list, searched by `query`. */
export function SectionList({ section, query, ...profileProps }: SectionListProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const list =
    section === "profiles" ? (
      <Profiles {...profileProps} query={query} selected={selected} onSelect={setSelected} />
    ) : section === "spaces" ? (
      <Spaces query={query} selected={selected} onSelect={setSelected} />
    ) : (
      <Boosts query={query} selected={selected} onSelect={setSelected} />
    );
  return <div className="-mr-2 mt-1.75 min-h-0 flex-1 overflow-y-auto pr-2 [scrollbar-width:none]">{list}</div>;
}

type ListProps = { query: string; selected: string | null; onSelect: (id: string | null) => void };

function Profiles({
  query,
  profiles,
  failed,
  onReload,
  naming,
  onCreate,
  onNamed,
  onRename,
  onDelete,
  selected,
  onSelect
}: ListProps & ProfileProps) {
  // The dialog up for a profile, which stays set as the dialog closes, for
  // its exit; `serial` makes each opening a dialog of its own, so a name
  // typed the last time is not left in it.
  const [asked, setAsked] = useState<{
    kind: "rename" | "delete";
    profile: Profile;
    open: boolean;
    serial: number;
  } | null>(null);
  const serial = useRef(0);
  const ask = (kind: "rename" | "delete", profile: Profile) =>
    setAsked({ kind, profile, open: true, serial: ++serial.current });
  if (!profiles) return failed ? <LoadFailed what="Profiles" onRetry={onReload} /> : <Loading />;
  const shown = profiles.filter((profile) => matches(query, profile.name));
  if (shown.length === 0 && !naming) return <Empty>No Profiles Found</Empty>;
  return (
    <div className="flex flex-col gap-0.5">
      {naming && <NewProfile onCreate={onCreate} onNamed={onNamed} />}
      {shown.map((profile) => (
        <div key={profile.id} className="flex flex-col gap-0.5">
          <Row
            selected={profile.id === selected}
            // Pressed again, it is let go, and its actions with it.
            onPress={() => onSelect(profile.id === selected ? null : profile.id)}
            tile={<ProfileTile name={profile.name} color={profile.color} />}
            title={profile.name}
          />
          <AnimatePresence initial={false}>
            {profile.id === selected && (
              <ProfileActions
                key="actions"
                onRename={() => ask("rename", profile)}
                onDelete={() => ask("delete", profile)}
              />
            )}
          </AnimatePresence>
        </div>
      ))}
      {asked &&
        (asked.kind === "rename" ? (
          <RenameDialog
            key={asked.serial}
            profile={asked.profile}
            open={asked.open}
            onOpenChange={(open) => setAsked({ ...asked, open })}
            onRename={onRename}
          />
        ) : (
          <DeleteDialog
            key={asked.serial}
            profile={asked.profile}
            open={asked.open}
            onOpenChange={(open) => setAsked({ ...asked, open })}
            onDelete={onDelete}
          />
        ))}
    </div>
  );
}

// What can be done to the selected profile: rows that slide down from its
// own, pushing the profiles under it down. With Reduced Motion they fade.
function ProfileActions({ onRename, onDelete }: { onRename: () => void; onDelete: () => void }) {
  const still = useReducedMotion();
  const ease = { duration: 0.2, ease: [0.23, 1, 0.32, 1] } as const;
  return (
    <motion.div
      initial={{ opacity: 0, ...(still ? {} : { height: 0 }) }}
      animate={{ opacity: 1, ...(still ? {} : { height: "auto" }) }}
      exit={{ opacity: 0, ...(still ? {} : { height: 0 }) }}
      transition={ease}
      className="overflow-hidden"
    >
      <div className="flex flex-col gap-0.5">
        <ActionRow icon={Pencil} onPress={onRename}>
          Rename
        </ActionRow>
        <ActionRow icon={Trash2} danger onPress={onDelete}>
          Delete
        </ActionRow>
      </div>
    </motion.div>
  );
}

// A row of the actions: its icon is under the profile's tile, its text under
// the profile's name.
function ActionRow({
  icon: Icon,
  danger,
  onPress,
  children
}: {
  icon: IconType;
  danger?: boolean;
  onPress: () => void;
  children: ReactNode;
}) {
  return (
    <Button
      shape="none"
      onClick={onPress}
      className={cn("flex h-9 items-center gap-3 rounded-row pl-1.5 text-left", danger && "text-danger")}
    >
      <span className={cn("grid size-9 place-items-center", !danger && "glyph-2")}>
        <Icon size={16} strokeWidth={1.75} />
      </span>
      {children}
    </Button>
  );
}

function ProfileTile({ name, color }: { name: string; color: string }) {
  return (
    <span
      className="grid size-9 place-items-center rounded-full text-[15px] font-semibold text-white"
      style={{ background: cssColor(color) }}
    >
      {name.trim()[0]?.toUpperCase()}
    </span>
  );
}

// The row a new profile is named in: Return makes it, Escape gives it up, as
// does leaving the field. Its error shows in place of its prompt, and the
// name stays to be fixed.
function NewProfile({ onCreate, onNamed }: Pick<SectionListProps, "onCreate" | "onNamed">) {
  const [name, setName] = useState("");
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const submit = () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    onCreate(name).then(onNamed, () => {
      setFailed(true);
      setBusy(false);
    });
  };
  return (
    <div className="no-drag flex h-12.5 shrink-0 items-center gap-3 rounded-row bg-selected pr-1.5 pl-1.5">
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-fill text-fg-2">
        {name.trim() ? <ProfileTile name={name} color="#8e8e93" /> : <Plus size={18} strokeWidth={2} />}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <input
          autoFocus
          value={name}
          disabled={busy}
          onChange={(event) => {
            setName(event.target.value);
            setFailed(false);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") submit();
            // Only this closes the row, not the Library behind it.
            if (event.key === "Escape") {
              event.preventDefault();
              onNamed();
            }
          }}
          onBlur={() => !busy && onNamed()}
          placeholder="Profile Name"
          spellCheck={false}
          className="min-w-0 bg-transparent text-fg outline-none placeholder:text-fg-3"
        />
        {failed && <span className="truncate text-subtitle text-fg-2">Could not make the profile</span>}
      </span>
    </div>
  );
}

function Spaces({ query, selected, onSelect }: ListProps) {
  const current = useSpace().space.id;
  const groups = spaceOwners
    .map((owner) => ({
      profile: owner,
      spaces: spaces.filter(
        (space) => space.profile === owner.id && (matches(query, space.name) || matches(query, owner.name))
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
  subtitle?: string;
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
        {subtitle && <span className="truncate text-subtitle text-fg-2">{subtitle}</span>}
      </span>
      {trailing}
    </motion.div>
  );
}

// While a list is read: a spinner, once the wait is long enough to be one. A
// quicker reading shows the list with nothing before it.
function Loading() {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setShown(true), 300);
    return () => clearTimeout(timer);
  }, []);
  return (
    <div role="status" aria-label="Loading" className="grid justify-center pt-10">
      <LoaderCircle
        size={18}
        strokeWidth={2}
        aria-hidden
        className={cn("animate-spin glyph-3 transition-opacity duration-150", !shown && "opacity-0")}
      />
    </div>
  );
}

function LoadFailed({ what, onRetry }: { what: string; onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 pt-10">
      <p className="text-fg-3">Could Not Load {what}</p>
      <Button variant="filled" onClick={onRetry}>
        Try Again
      </Button>
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="pt-10 text-center text-fg-3">{children}</p>;
}
