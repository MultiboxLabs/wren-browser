// A group of rows on a step's right half, as the system's settings group
// theirs: one rounded fill, rows divided by a hairline that starts where
// their text does. The steps that bring things over list in them.

import type { ReactNode } from "react";
import { motion } from "motion/react";
import { rise } from "./rise";

export function Group({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <motion.section {...rise(3)} className="flex w-full flex-col gap-1.5">
      {title && <h2 className="px-3.5 text-subtitle text-fg-3">{title}</h2>}
      <div className="flex flex-col rounded-[14px] bg-fill py-1">{children}</div>
    </motion.section>
  );
}

/** A row: its icon, its name, then what it says and does at its end. */
export function GroupRow({ icon, name, children }: { icon: ReactNode; name: ReactNode; children?: ReactNode }) {
  return (
    <div className="relative flex h-12.5 items-center gap-3 px-3.5 text-onboarding-option-body [&+&]:before:absolute [&+&]:before:top-0 [&+&]:before:right-0 [&+&]:before:left-[52px] [&+&]:before:border-t-[0.5px] [&+&]:before:border-separator">
      {icon}
      <span className="min-w-0 flex-1 truncate font-medium">{name}</span>
      {children}
    </div>
  );
}
