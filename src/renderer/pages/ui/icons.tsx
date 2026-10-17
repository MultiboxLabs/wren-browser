// Icons of our own, drawn in the text colour like Lucide's, so they take the
// same props (Icon, components/ui/icon-button.tsx). `size` is the width in
// points; each keeps its own stroke, as heavy as the system's toolbar icons.

type Props = { size?: number; strokeWidth?: number };

/** The sidebar button's: a window with its sidebar marked. */
export function SidebarIcon({ size = 19 }: Props) {
  return (
    <svg width={size} height={(size * 31) / 39} viewBox="17 14 39 31" fill="none" aria-hidden>
      <g stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        <rect x="19.5" y="16.5" width="34" height="25.5" rx="3.6" strokeWidth="3.5" />
        <path d="M31.8 16.5V42" strokeWidth="3.5" />
        <path d="M24.1 22.7H27M24.1 26.9H27M24.1 31.1H27" strokeWidth="2.8" />
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
        strokeWidth="1.7"
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
      <g stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M11.4 6.5A6 6 0 1 1 7.5 4.6" />
        <path d="M5.2 2.1 7.6 4.6 5.2 7.1" />
      </g>
    </svg>
  );
}
