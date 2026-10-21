// What the Library's lists are made of: a row (a tile and two lines, selected
// on press as a native list's), the row of an action, and what a list shows
// while it is read, failed, or has nothing.

import { LoaderCircle } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { type ReactNode, useEffect, useState } from "react";
import { Button, type Icon as IconType } from "../ui/button";
import { press } from "../ui/press";
import { cn } from "../../utils/cn";

/** Whether `query`, already lowercased, is in any of `texts`. */
export const matches = (query: string, ...texts: (string | undefined)[]) =>
  texts.some((text) => text?.toLowerCase().includes(query));

export type ListProps = { query: string; selected: string | null; onSelect: (id: string | null) => void };

export function Row({
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
export function Loading() {
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

export function LoadFailed({ what, onRetry }: { what: string; onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 pt-10">
      <p className="text-fg-3">Could Not Load {what}</p>
      <Button variant="filled" onClick={onRetry}>
        Try Again
      </Button>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="pt-10 text-center text-fg-3">{children}</p>;
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

export type RowAction = { label: string; icon: IconType; danger?: boolean; onPress: () => void };

// What can be done to the selected row: rows that slide down from its own,
// pushing the rows under it down. With Reduced Motion they fade. Wrap it in
// `AnimatePresence`, for its exit.
export function RowActions({ actions }: { actions: RowAction[] }) {
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
        {actions.map(({ label, icon, danger, onPress }) => (
          <ActionRow key={label} icon={icon} danger={danger} onPress={onPress}>
            {label}
          </ActionRow>
        ))}
      </div>
    </motion.div>
  );
}
