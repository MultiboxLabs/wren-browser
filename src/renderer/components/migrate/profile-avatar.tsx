// A source's profile's picture, as its browser shows it; or, with none to be
// had, its initial on a disc, filled as the page that shows it gives
// (`className`), as wren://migrate and onboarding fill it.

import { useState } from "react";
import { iconUrl } from "@/ipc";
import { cn } from "@/utils/cn";

export function ProfileAvatar({ name, picture, className }: { name: string; picture?: string; className: string }) {
  const [broken, setBroken] = useState(false);
  if (picture && !broken)
    return (
      <img
        src={iconUrl(picture)}
        alt=""
        draggable={false}
        onError={() => setBroken(true)}
        className="size-6.5 shrink-0 rounded-full object-cover"
      />
    );
  return (
    <span className={cn("grid size-6.5 shrink-0 place-items-center rounded-full text-[12px] font-semibold", className)}>
      {name[0]}
    </span>
  );
}
