// The Library's filter of its downloads, by the profile each is of: a Filter
// button beside the search field, which opens the profiles to choose from
// under it, and the profile chosen, shown there once they close. Every
// profile is a choice, one with no downloads too; it is there only while
// there is more than one.

import { CircleX, ListFilter } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { type ReactNode, useState } from "react";
import type { ProfileEntry } from "../../ipc";
import { Button } from "../ui/button";
import { cn } from "../../utils/cn";

export type DownloadsFilter = ReturnType<typeof useDownloadsFilter>;

/**
 * The profile chosen, and whether the choice is open. `profiles` are the
 * Library's, which are the choices, in their order.
 */
export function useDownloadsFilter(profiles: ProfileEntry[] | null) {
  const [chosen, setChosen] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const choices = profiles ?? [];
  const shown = choices.length > 1;
  return {
    /** There is more than one profile to choose from. */
    shown,
    choices,
    /** The profile chosen, while it is still a choice. */
    profile: shown ? (choices.find(({ id }) => id === chosen) ?? null) : null,
    /** The choice is open. */
    open: shown && open,
    setOpen,
    /** Chooses a profile, or none; choosing the one chosen chooses none. */
    choose: (id: string | null) => setChosen((current) => (id === current ? null : id)),
    reset: () => {
      setChosen(null);
      setOpen(false);
    }
  };
}

/**
 * Beside the search field: opens the choice, and closes it. As wide either
 * way, so the field beside it stays as it is.
 */
export function FilterButton({ filter }: { filter: DownloadsFilter }) {
  if (!filter.shown) return null;
  return (
    <Button
      variant="filled"
      shape="large"
      icon={filter.open ? undefined : ListFilter}
      iconSize={14}
      iconTone="dim"
      pressed={filter.open}
      onClick={() => filter.setOpen(!filter.open)}
      className="w-21 min-w-0 px-0 font-medium text-fg-2"
    >
      {filter.open ? "Done" : "Filter"}
    </Button>
  );
}

/**
 * Under the search field: the profiles to choose from while the choice is
 * open, or else the one chosen, which a press takes off. As one goes, the
 * other comes, each folding in its place.
 */
export function FilterBar({ filter }: { filter: DownloadsFilter }) {
  const { profile } = filter;
  return (
    <>
      <Folds shown={filter.open}>
        <div role="group" aria-label="Profiles" className="flex flex-col gap-1.5 pt-3">
          <h3 className="px-1.5 text-subtitle font-semibold text-fg-2">Profiles</h3>
          <div className="flex flex-wrap gap-1.5">
            {filter.choices.map(({ id, name }) => (
              <Button
                key={id}
                variant="filled"
                pressed={id === profile?.id}
                onClick={() => filter.choose(id)}
                className={cn("font-medium", id === profile?.id ? "text-fg" : "text-fg-2")}
              >
                {name}
              </Button>
            ))}
          </div>
        </div>
      </Folds>
      <Folds shown={!filter.open && profile !== null}>
        <div className="flex pt-2">
          <Button
            variant="filled"
            icon={CircleX}
            iconSize={14}
            iconTone="dim"
            label="Show Every Profile’s Downloads"
            onClick={() => filter.choose(null)}
            className="font-medium text-fg-2"
          >
            {profile?.name}
          </Button>
        </div>
      </Folds>
    </>
  );
}

const ease = { duration: 0.2, ease: [0.23, 1, 0.32, 1] } as const;

// What unfolds as it comes, pushing what is under it down, and folds away
// as it goes; with Reduced Motion it fades.
function Folds({ shown, children }: { shown: boolean; children: ReactNode }) {
  const still = useReducedMotion();
  return (
    <AnimatePresence initial={false}>
      {shown && (
        <motion.div
          initial={{ opacity: 0, ...(still ? {} : { height: 0 }) }}
          animate={{ opacity: 1, ...(still ? {} : { height: "auto" }) }}
          exit={{ opacity: 0, ...(still ? {} : { height: 0 }) }}
          transition={ease}
          className="shrink-0 overflow-hidden"
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
