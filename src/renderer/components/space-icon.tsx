// A space's icon: a Lucide icon from the curated set, named `lucide:<name>`,
// or an emoji. A window on a profile draws one of its own.

import {
  Book,
  Briefcase,
  Camera,
  CircleUserRound,
  Code,
  Coffee,
  Dumbbell,
  Film,
  FlaskConical,
  Flame,
  Gamepad2,
  Globe,
  GraduationCap,
  HatGlasses,
  Heart,
  House,
  Leaf,
  Moon,
  Mountain,
  Music,
  Newspaper,
  Orbit,
  Palette,
  Plane,
  Rocket,
  ShoppingBag,
  Sparkles,
  Star,
  Sun,
  Users,
  Wallet,
  Zap
} from "lucide-react";
import type { Icon } from "./ui/button";

const PREFIX = "lucide:";

/** The icons a space can have, by Lucide's name for them. Each is imported by name, so the build keeps only these. */
export const SPACE_ICONS: Record<string, Icon> = {
  orbit: Orbit,
  house: House,
  briefcase: Briefcase,
  book: Book,
  "graduation-cap": GraduationCap,
  code: Code,
  palette: Palette,
  music: Music,
  "gamepad-2": Gamepad2,
  plane: Plane,
  "shopping-bag": ShoppingBag,
  heart: Heart,
  star: Star,
  coffee: Coffee,
  dumbbell: Dumbbell,
  camera: Camera,
  film: Film,
  newspaper: Newspaper,
  "flask-conical": FlaskConical,
  leaf: Leaf,
  sun: Sun,
  moon: Moon,
  globe: Globe,
  rocket: Rocket,
  wallet: Wallet,
  users: Users,
  sparkles: Sparkles,
  flame: Flame,
  mountain: Mountain,
  zap: Zap
};

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
  const Named = name === undefined ? undefined : (SPACE_ICONS[name] ?? PROFILE_ICONS[name]);
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
