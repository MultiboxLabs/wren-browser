// A row to choose in the import step's list: a browser, or Start Fresh. Its
// icon and name, a line under it, and a radio circle.

import type { ReactNode } from "react";
import { cn } from "@/utils/cn";
import { Option, RadioMark } from "./option";

export function Row({
  icon,
  name,
  detail,
  chosen,
  onChoose,
  className
}: {
  icon: ReactNode;
  className?: string;
  name: string;
  detail?: string;
  chosen: boolean;
  onChoose: () => void;
}) {
  return (
    <Option
      chosen={chosen}
      onChoose={onChoose}
      className={cn("flex h-14 shrink-0 items-center gap-3.5 rounded-[14px] px-3.5", className)}
    >
      {icon}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-onboarding-body font-medium">{name}</span>
        {detail && <span className="text-subtitle text-fg-3">{detail}</span>}
      </span>
      <RadioMark chosen={chosen} size={20} />
    </Option>
  );
}
