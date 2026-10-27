// A space's icon: a Lucide icon from the catalog (icon-picker/catalog.ts),
// named `lucide:<name>`, or an emoji. A window on a profile draws one of its
// own.

import { CircleUserRound, HatGlasses, Orbit } from "lucide-react";
import { SPACE_GLYPHS } from "./icon-picker/catalog";
import type { Icon } from "./ui/button";

const PREFIX = "lucide:";

/** The icons of a window on a profile, which a space can't have. */
const PROFILE_ICONS: Record<string, Icon> = {
  "circle-user-round": CircleUserRound,
  "hat-glasses": HatGlasses
};

/** A profile's icon, and its off-the-record side's. */
export const PROFILE_ICON = `${PREFIX}circle-user-round`;
export const OFF_THE_RECORD_ICON = `${PREFIX}hat-glasses`;

/** What a new space has. */
export const DEFAULT_ICON = `${PREFIX}orbit`;

const segmenter = new Intl.Segmenter();

/** Whether `text` is one emoji, as a space's icon can be. */
export function isEmoji(text: string) {
  const [first, ...rest] = [...segmenter.segment(text)];
  return first !== undefined && rest.length === 0 && /\p{Extended_Pictographic}/u.test(first.segment);
}

export function SpaceIcon({ icon, size = 18, strokeWidth = 2 }: { icon: string; size?: number; strokeWidth?: number }) {
  const name = icon.startsWith(PREFIX) ? icon.slice(PREFIX.length) : undefined;
  const Named = name === undefined ? undefined : (SPACE_GLYPHS[name] ?? PROFILE_ICONS[name]);
  if (Named) return <Named size={size} strokeWidth={strokeWidth} />;
  if (isEmoji(icon)) {
    return (
      <span aria-hidden className="leading-none" style={{ fontSize: size * 0.9 }}>
        {icon}
      </span>
    );
  }
  return <Orbit size={size} strokeWidth={strokeWidth} />;
}
