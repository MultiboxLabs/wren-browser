// A group of rows, as the system's settings group theirs: one rounded fill,
// rows divided by a hairline that starts where their text does.

import type { ReactNode } from "react";

export function Group({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="flex w-full flex-col gap-1.5">
      {title && <h2 className="px-3.5 text-[12px] text-(--fg-faint)">{title}</h2>}
      <div className="flex flex-col rounded-[12px] bg-(--group) py-1">{children}</div>
    </section>
  );
}

/** A row: its icon, its name, then what it says and does at its end. */
export function Row({ icon, name, children }: { icon: ReactNode; name: ReactNode; children?: ReactNode }) {
  return (
    <div className="relative flex h-12.5 items-center gap-3 px-3.5 text-[14px] [&+&]:before:absolute [&+&]:before:top-0 [&+&]:before:right-0 [&+&]:before:left-[52px] [&+&]:before:border-t-[0.5px] [&+&]:before:border-(--hairline)">
      {icon}
      <span className="min-w-0 flex-1 truncate">{name}</span>
      {children}
    </div>
  );
}
