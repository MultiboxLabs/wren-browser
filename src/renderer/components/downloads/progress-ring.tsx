// A download's progress: a down arrow on a white disc, ringed by how far it
// has come. The Library button's indicator has it for all the downloads
// together, and a row of the shelf or the Library for its own. While the
// size is not known, or the file is being scanned, a short arc spins round.

import { ArrowDown } from "lucide-react";
import { cn } from "../../utils/cn";

// The ring's radius in the 20-point box it is drawn in, and its length.
const RADIUS = 8.5;
const LENGTH = 2 * Math.PI * RADIUS;

export function ProgressRing({
  fraction,
  size
}: {
  /** 0 to 1; null while it is not known, which spins. */
  fraction: number | null;
  size: number;
}) {
  const shown = fraction === null ? 0.25 : Math.min(1, Math.max(0, fraction));
  return (
    <span
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={fraction === null ? undefined : Math.round(shown * 100)}
      style={{ width: size, height: size }}
      className="relative grid shrink-0 place-items-center rounded-full bg-white shadow-raised"
    >
      <svg aria-hidden viewBox="0 0 20 20" className={cn("absolute inset-0", fraction === null && "animate-spin")}>
        <circle
          cx="10"
          cy="10"
          r={RADIUS}
          fill="none"
          strokeWidth="1.5"
          style={{ stroke: "color-mix(in srgb, var(--prominent) 22%, transparent)" }}
        />
        <circle
          cx="10"
          cy="10"
          r={RADIUS}
          fill="none"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeDasharray={LENGTH}
          strokeDashoffset={LENGTH * (1 - shown)}
          // From the top, clockwise.
          transform="rotate(-90 10 10)"
          style={{ stroke: "var(--prominent)", transition: "stroke-dashoffset 0.3s ease-out" }}
        />
      </svg>
      <ArrowDown size={size * 0.55} strokeWidth={2.25} style={{ color: "var(--prominent)" }} />
    </span>
  );
}
