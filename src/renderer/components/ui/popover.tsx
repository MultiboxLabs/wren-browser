// A popover, as a native one: it hangs below what opens it by an arrow, over
// whatever is there (the page too), and goes on Escape or a click elsewhere.
// It is light or dark as the system is, not the space. Pushed along by the
// window's side, its arrow can come to a corner: that corner rounds less, and
// the arrow moves in off it a little, so the arrow meets a straight edge.

import { Popover as Radix } from "radix-ui";
import type { ReactNode } from "react";
import { useHoldWhile } from "./hold";

export function Popover({
  open,
  onOpenChange,
  trigger,
  label,
  arrowFill,
  side = "bottom",
  windowMargin = 8,
  anchored = false,
  stayOnOutsidePress = false,
  onEscape,
  children
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Opens and closes it; it must take a ref (a DOM element). */
  trigger: ReactNode;
  /** `trigger` only marks what it hangs off, and a press on it does not open or close it: `open` alone does. */
  anchored?: boolean;
  /**
   * A press or the keyboard's focus outside it leaves it open: for what
   * waits for an answer, which a stray click must not throw away. Escape
   * and a press on `trigger` still close it.
   */
  stayOnOutsidePress?: boolean;
  /** Escape is pressed in it, before it closes (`onOpenChange`). */
  onEscape?: () => void;
  /** What it is, for assistive technology. */
  label: string;
  /**
   * What fills the arrow, from the bottom up, when what is in the popover is
   * not the popover's own colour (a layer's `opacity` is how much of it shows):
   * the popover's colour is under them.
   */
  arrowFill?: { color: string; opacity?: number }[];
  /** Which side of the trigger it opens on, if there is room; below by default. */
  side?: "top" | "right" | "bottom" | "left";
  /**
   * The least room it keeps from the window's sides. Less, for a trigger
   * near one, lets its arrow point at it from off the popover's rounded
   * corner: Radix hides an arrow that cannot.
   */
  windowMargin?: number;
  children: ReactNode;
}) {
  useHoldWhile(open);
  return (
    <Radix.Root open={open} onOpenChange={onOpenChange}>
      {anchored ? <Radix.Anchor asChild>{trigger}</Radix.Anchor> : <Radix.Trigger asChild>{trigger}</Radix.Trigger>}
      <Radix.Portal>
        <Radix.Content
          aria-label={label}
          side={side}
          sideOffset={2}
          collisionPadding={windowMargin}
          // Opened by a click, it takes no focus ring to its first control.
          onOpenAutoFocus={(event) => event.preventDefault()}
          onEscapeKeyDown={onEscape}
          onInteractOutside={(event) => {
            if (stayOnOutsidePress) event.preventDefault();
          }}
          data-scheme="system"
          // Over the window's title bar too: a press in it is the
          // popover's, not a drag of the window.
          className="popover no-drag z-50 outline-none"
        >
          {children}
          {/* Radix gives the <svg> its size, so it is the arrow's own child. */}
          <Radix.Arrow asChild width={ARROW.width} height={ARROW.height} ref={fitCorner}>
            <svg viewBox={`0 0 ${ARROW.width} ${ARROW.height}`} overflow="visible" aria-hidden>
              <ArrowPaths fill={arrowFill} />
            </svg>
          </Radix.Arrow>
        </Radix.Content>
      </Radix.Portal>
    </Radix.Root>
  );
}

const ARROW = { width: 22, height: 9 };

// The least a corner the arrow comes to still rounds. The arrow moves in off
// it to leave the room, up to this far from the middle of what it points at,
// which is still on it.
const CORNER_MIN = 8;

// For each side the popover opens on, the two corners at the ends of the
// edge the arrow is on, start then end, and which way the arrow's own x runs
// along that edge as Radix turns it: 1 toward the end, -1 toward the start.
const EDGES = {
  bottom: { corners: ["borderTopLeftRadius", "borderTopRightRadius"], along: -1 },
  top: { corners: ["borderBottomLeftRadius", "borderBottomRightRadius"], along: 1 },
  right: { corners: ["borderTopLeftRadius", "borderBottomLeftRadius"], along: 1 },
  left: { corners: ["borderTopRightRadius", "borderBottomRightRadius"], along: -1 }
} as const;

// Rounds the corner the arrow comes to less, no less than `CORNER_MIN`, and
// moves the arrow in off it for that much room, as Radix moves the arrow (its
// <span>'s style) or the popover changes size. The two are measured on
// screen, so the arrow's turn for its side counts, and scaled back by the
// popover's own scale as it grows in.
function fitCorner(svg: SVGSVGElement | null) {
  const arrow = svg?.parentElement;
  const content = arrow?.parentElement;
  if (!svg || !arrow || !content) return;
  const fit = () => {
    content.style.borderRadius = "";
    svg.style.translate = "";
    const side = content.dataset.side as keyof typeof EDGES | undefined;
    if (!side || arrow.style.visibility === "hidden") return;
    const box = content.getBoundingClientRect();
    const tip = arrow.getBoundingClientRect();
    const across = side === "left" || side === "right";
    const scale = (across ? box.height / content.offsetHeight : box.width / content.offsetWidth) || 1;
    const start = (across ? tip.top - box.top : tip.left - box.left) / scale;
    const end = (across ? box.bottom - tip.bottom : box.right - tip.right) / scale;
    const radius = parseFloat(getComputedStyle(content).getPropertyValue("--radius-popover"));
    const { corners, along } = EDGES[side];
    // How far the arrow moves toward the end of its edge: in off the start
    // corner, or back off the end one.
    const shift = Math.max(0, CORNER_MIN - start) - Math.max(0, CORNER_MIN - end);
    if (start < radius) content.style[corners[0]] = `${Math.max(CORNER_MIN, start)}px`;
    if (end < radius) content.style[corners[1]] = `${Math.max(CORNER_MIN, end)}px`;
    if (shift) svg.style.translate = `${shift * along}px 0`;
  };
  fit();
  const moves = new MutationObserver(fit);
  moves.observe(arrow, { attributes: true, attributeFilter: ["style"] });
  moves.observe(content, { attributes: true, attributeFilter: ["data-side"] });
  const resizes = new ResizeObserver(fit);
  resizes.observe(content);
  return () => {
    moves.disconnect();
    resizes.disconnect();
  };
}

// The arrow, drawn pointing down from its base as Radix turns it: straight
// sides into a rounded tip, edged as the popover is. Its fill runs a little
// past its base, over the popover's own edge, so the two read as one.
function ArrowPaths({ fill = [] }: { fill?: { color: string; opacity?: number }[] }) {
  const edge = "M0 0C3.4 0 5.6 2.4 8.1 5.6Q11 9.2 13.9 5.6C16.4 2.4 18.6 0 22 0";
  return (
    <>
      <path d={edge} fill="none" stroke="var(--popover-edge)" strokeWidth="1.5" />
      <path d={`${edge}V-2H0Z`} fill="var(--popover)" />
      {fill.map(({ color, opacity = 1 }, index) => (
        <path key={index} d={`${edge}V-2H0Z`} fill={color} fillOpacity={opacity} />
      ))}
      <path d={edge} fill="none" stroke="var(--popover-highlight)" strokeWidth="1" />
    </>
  );
}
