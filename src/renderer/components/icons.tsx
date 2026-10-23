// Icons of our own, drawn in the text colour like Lucide's, so they take the
// same props (Icon, components/ui/button.tsx). `size` is the width in
// points; each keeps its own stroke, as heavy as the system's toolbar icons.

import { useId } from "react";

type Props = { size?: number; strokeWidth?: number };

/** Wren's mark, the wren (branding/wren-light.svg), filled in the text colour. */
export function WrenMark({ size = 24 }: Props) {
  // Its masks' IDs, which are the document's: one for each mark drawn.
  const id = useId();
  const cut = { stroke: "#000", strokeWidth: 32, strokeLinejoin: "round" } as const;
  const body =
    "M466 228 L 424 238 C 438 322 368 424 262 424 C 200 424 152 384 152 320 C 152 228 262 152 356 152 C 394 152 420 172 426 194 L 466 206 C 482 210 482 226 466 228 Z";
  const wing = "M332 262 C 324 330 262 366 132 352 C 190 300 262 262 332 262 Z";
  return (
    <svg width={size} height={(size * 311.879) / 354.2596} viewBox="78.7404 100.121 354.2596 311.879" aria-hidden>
      <defs>
        <mask id={`${id}-tail`} maskUnits="userSpaceOnUse" x="0" y="0" width="512" height="512">
          <rect width="512" height="512" fill="#fff" />
          <path d={body} {...cut} />
        </mask>
        <mask id={`${id}-body`} maskUnits="userSpaceOnUse" x="0" y="0" width="512" height="512">
          <rect width="512" height="512" fill="#fff" />
          <path d={wing} {...cut} />
          <circle cx="360" cy="206" r="17" fill="#000" />
        </mask>
      </defs>
      <g transform="translate(-45 -12)" fill="currentColor">
        <path
          mask={`url(#${id}-tail)`}
          d="M226 270 C 206 226 178 172 150 120 C 144 108 128 110 126 124 C 116 196 140 258 182 304 Z"
        />
        <path mask={`url(#${id}-body)`} d={body} />
        <path d={wing} />
      </g>
    </svg>
  );
}

/** The sidebar button's: a window with its sidebar marked. */
export function SidebarIcon({ size = 19 }: Props) {
  return (
    <svg width={size} height={(size * 31) / 39} viewBox="17 14 39 31" fill="none" aria-hidden>
      <g stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        <rect x="19.5" y="16.5" width="34" height="25.5" rx="5" strokeWidth="3.1" />
        <path d="M31.8 16.5V42" strokeWidth="3.1" />
        <path d="M24.1 22.7H27M24.1 26.9H27M24.1 31.1H27" strokeWidth="2.5" />
      </g>
    </svg>
  );
}

function Arrow({ size = 17, flip }: Props & { flip?: boolean }) {
  return (
    <svg width={size} height={(size * 14) / 17} viewBox="0 0 17 14" fill="none" aria-hidden>
      <path
        d="M15.5 7H1.5M6.5 2 1.5 7l5 5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        transform={flip ? "matrix(-1 0 0 1 17 0)" : undefined}
      />
    </svg>
  );
}

export const BackIcon = (props: Props) => <Arrow {...props} />;
export const ForwardIcon = (props: Props) => <Arrow {...props} flip />;

/** Reload: a circle open at the top right, with its arrowhead at the top. */
export function ReloadIcon({ size = 15 }: Props) {
  return (
    <svg width={size} height={(size * 18) / 15} viewBox="0 0 15 18" fill="none" aria-hidden>
      <g stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M11.4 6.5A6 6 0 1 1 7.5 4.6" />
        <path d="M5.2 2.1 7.6 4.6 5.2 7.1" />
      </g>
    </svg>
  );
}

/** Stop: a cross, in the reload icon's box so the button keeps its size. */
export function StopIcon({ size = 15 }: Props) {
  return (
    <svg width={size} height={(size * 18) / 15} viewBox="0 0 15 18" fill="none" aria-hidden>
      <path d="M3 4.5 12 13.5M12 4.5 3 13.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/** Page info: a rounded square with two sliders in it, their knobs apart. */
export function PageInfoIcon({ size = 18 }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" aria-hidden>
      <g stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <rect x="1.25" y="1.25" width="15.5" height="15.5" rx="4.5" />
        <path d="M5.25 6.75h7.5M5.25 11.25h7.5" />
      </g>
      <circle cx="10.9" cy="6.75" r="1.75" fill="currentColor" />
      <circle cx="7.1" cy="11.25" r="1.75" fill="currentColor" />
    </svg>
  );
}

/** Not secure: Lucide's lock, struck through. */
export function InsecureIcon({ size = 24, strokeWidth = 2 }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <g stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        <path d="M2 2l20 20" />
      </g>
    </svg>
  );
}
