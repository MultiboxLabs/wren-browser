// Icons of our own, drawn in the text colour like Lucide's, so they take the
// same props (Icon, components/ui/button.tsx). `size` is the width in
// points; each keeps its own stroke, as heavy as the system's toolbar icons.

import { motion, useReducedMotion } from "motion/react";
import { useId } from "react";

type Props = { size?: number; strokeWidth?: number };

/** The box the wren's shapes are drawn in (branding/wren-light.svg's). */
export const WREN_BOX = { x: 78.7404, y: 100.121, width: 354.2596, height: 311.879 };

/** The wren's shapes, filled in the text colour, in `WREN_BOX`; `id` names their masks, which are the document's. */
export function wrenShapes(id: string) {
  const cut = { stroke: "#000", strokeWidth: 32, strokeLinejoin: "round" } as const;
  const body =
    "M466 228 L 424 238 C 438 322 368 424 262 424 C 200 424 152 384 152 320 C 152 228 262 152 356 152 C 394 152 420 172 426 194 L 466 206 C 482 210 482 226 466 228 Z";
  const wing = "M332 262 C 324 330 262 366 132 352 C 190 300 262 262 332 262 Z";
  return (
    <>
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
    </>
  );
}

/** Wren's mark, the wren, filled in the text colour. */
export function WrenMark({ size = 24 }: Props) {
  const id = useId();
  const { x, y, width, height } = WREN_BOX;
  return (
    <svg width={size} height={(size * height) / width} viewBox={`${x} ${y} ${width} ${height}`} aria-hidden>
      {wrenShapes(id)}
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

// How long one of the speaker's marks takes to draw or undraw, and how long
// after the one before it the next starts.
const SOUND_MARK = 0.11;
const SOUND_STEP = 0.05;
// How far the speaker's body slides to stand under the slash, centred without its waves.
const SOUND_BODY_SHIFT = 2.9;
const SOUND_SLASH = "M3.4 2.6 12.9 15.4";

/** One of the speaker's marks, drawn along its line, `at` steps in. */
function SoundMark({ d, on, at, still }: { d: string; on: boolean; at: number; still: boolean | null }) {
  const delay = at * SOUND_STEP;
  return (
    <motion.path
      d={d}
      initial={false}
      animate={{ pathLength: on ? 1 : 0, opacity: on ? 1 : 0 }}
      transition={
        still
          ? { duration: 0 }
          : {
              pathLength: { duration: SOUND_MARK, delay, ease: "easeInOut" },
              // At once, at the end its line is not there: a round cap would leave a dot.
              opacity: { duration: 0, delay: on ? delay : delay + SOUND_MARK }
            }
      }
    />
  );
}

/**
 * A filled speaker: two waves as it plays; muted, a slash through it, with a
 * gap cut around the slash. The waves undraw from the outside in as the body
 * slides to the middle and the slash draws, and the other way back.
 */
export function SoundIcon({ muted, size = 17 }: { muted: boolean; size?: number }) {
  // Its mask's ID, which is the document's: one for each icon drawn.
  const id = useId();
  const still = useReducedMotion();
  const slash = { d: SOUND_SLASH, on: muted, at: muted ? 1.5 : 0, still };
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" aria-hidden>
      <mask id={id} maskUnits="userSpaceOnUse" x="0" y="0" width="18" height="18">
        <rect width="18" height="18" fill="#fff" />
        <g stroke="#000" strokeWidth="3.2" strokeLinecap="round">
          <SoundMark {...slash} />
        </g>
      </mask>
      <g mask={`url(#${id})`}>
        <motion.path
          d="M2.6 6.3H4.7L7.9 3.5C8.4 3.05 9.2 3.4 9.2 4.1V13.9C9.2 14.6 8.4 14.95 7.9 14.5L4.7 11.7H2.6C1.9 11.7 1.4 11.2 1.4 10.5V7.5C1.4 6.8 1.9 6.3 2.6 6.3Z"
          fill="currentColor"
          initial={false}
          animate={{ x: muted ? SOUND_BODY_SHIFT : 0 }}
          transition={still ? { duration: 0 } : { duration: 0.2, ease: "easeInOut" }}
        />
      </g>
      <g stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
        <SoundMark d="M11.42 5.92A4.6 4.6 0 0 1 11.42 12.08" on={!muted} at={1} still={still} />
        <SoundMark d="M13.35 3.06A8 8 0 0 1 13.35 14.94" on={!muted} at={muted ? 0 : 2} still={still} />
        <SoundMark {...slash} />
      </g>
    </svg>
  );
}

/** Sharing a screen: a screen capture's corners, around a dot. */
export function ScreenShareIcon({ size = 17 }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" aria-hidden>
      <path
        d="M1.4 6.4V5a2 2 0 0 1 2-2h2M12.6 3h2a2 2 0 0 1 2 2v1.4M16.6 11.6V13a2 2 0 0 1-2 2h-2M5.4 15h-2a2 2 0 0 1-2-2v-1.4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="9" cy="9" r="2.9" fill="currentColor" />
    </svg>
  );
}

/** Being captured: a ring around a dot, as a recording's mark. */
export function CaptureIcon({ size = 17 }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" aria-hidden>
      <circle cx="9" cy="9" r="7.7" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="9" cy="9" r="3.9" fill="currentColor" />
    </svg>
  );
}

/** The camera in use: a filled video camera, its lens's flap apart. */
export function CameraIcon({ size = 17 }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="currentColor" aria-hidden>
      <rect x="1" y="4.2" width="11" height="9.6" rx="2.7" />
      <path d="M13.2 8.1 15.6 6.3C16.2 5.85 17 6.3 17 7V11C17 11.7 16.2 12.15 15.6 11.7L13.2 9.9Z" />
    </svg>
  );
}

/** The microphone in use: a filled capsule on its stand. */
export function MicrophoneIcon({ size = 17 }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" aria-hidden>
      <rect x="5.7" y="1" width="6.6" height="10.4" rx="3.3" fill="currentColor" />
      <path
        d="M3.2 8.3v.5a5.8 5.8 0 0 0 11.6 0v-.5M9 14.7V17"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}
