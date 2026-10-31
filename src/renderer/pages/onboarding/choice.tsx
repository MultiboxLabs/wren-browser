// An option of a yes-or-no step (the ad blocker, the default browser): a
// card with room to say what it means: its icon (option-icons.tsx), its
// title over a sentence or two, and a radio circle.

import type { ReactNode } from "react";
import { Option, RadioMark } from "./option";

export function Choice({
  icon,
  title,
  note,
  body,
  chosen,
  onChoose
}: {
  icon: ReactNode;
  title: string;
  /** A word beside the title: "Recommended". */
  note?: string;
  body: string;
  chosen: boolean;
  onChoose: () => void;
}) {
  return (
    <Option
      chosen={chosen}
      onChoose={onChoose}
      className="flex w-full items-start gap-4.5 rounded-[20px] px-5.5 py-5.5"
    >
      <span className="mt-0.5">{icon}</span>
      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="flex items-baseline gap-2">
          <span className="text-onboarding-option font-semibold tracking-[-0.01em]">{title}</span>
          {note && <span className="text-subtitle font-medium text-fg-3">{note}</span>}
        </span>
        <span className="text-onboarding-option-body leading-relaxed text-pretty text-fg-2">{body}</span>
      </span>
      <RadioMark chosen={chosen} size={22} className="mt-0.5" />
    </Option>
  );
}
