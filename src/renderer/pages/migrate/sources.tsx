// The browsers the user may bring their things over from, as pills: each
// app's icon and name, the chosen one ringed in the accent.

import { motion } from "motion/react";
import { press } from "@/components/ui/press";
import type { MigrateSource } from "@/ipc";
import { cn } from "@/utils/cn";
import { SourceIcon } from "./source-icon";

export function Sources({
  sources,
  chosen,
  onChoose
}: {
  sources: MigrateSource[];
  chosen?: string;
  onChoose: (id: string) => void;
}) {
  return (
    <div role="radiogroup" aria-label="Browser" className="flex flex-wrap justify-center gap-2.5">
      {sources.map((source) => {
        const on = source.id === chosen;
        return (
          <motion.button
            key={source.id}
            {...press(0.97)}
            role="radio"
            aria-checked={on}
            onClick={() => onChoose(source.id)}
            className={cn(
              "flex h-10 items-center gap-2 rounded-full pr-4 pl-2 text-[14px] outline-none",
              on
                ? "bg-(--page) text-(--fg) shadow-[0_0_0_2px_var(--space),0_2px_10px_rgb(79_85_214/0.18)]"
                : "bg-(--pill) text-(--fg-quiet) hover:text-(--fg)"
            )}
          >
            <SourceIcon source={source} size={26} />
            {source.name}
          </motion.button>
        );
      })}
    </div>
  );
}
