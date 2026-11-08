// The pad the theme's colours are placed on: a 340pt square of faint fine
// dots, with the appearances over its top and the buttons for the number of
// colours over its foot, and a knob for each colour. A knob turns round the
// centre for hue and moves out from it for lightness (utils/theme-pad.ts).
// Dragging any knob moves them all, as they are derived from the primary, and
// it moves from where it was grabbed, so it doesn't jump to the pointer. A
// press off the knobs takes the primary there: the knobs slide to it, then
// follow the pointer if it drags on. A theme with no colour chosen has no
// knobs, and the first press puts the primary's there, growing in.

import { Minus, Plus } from "lucide-react";
import {
  type ComponentProps,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  useEffect,
  useRef,
  useState
} from "react";
import { cn } from "@/utils/cn";
import { cssEase, EASE_SLIDE } from "@/utils/motion";
import { colorCss, derivedColors, isBlank } from "@/utils/theme";
import { dragKnob, knobAt, nudgeKnob, type Point, withAppearance, withColors } from "@/utils/theme-pad";
import { AppearanceButtons } from "./appearance-buttons";
import type { EditProps } from "./edit";
import { PickerButton } from "./picker-button";

const MAX_COLORS = 3;
// How far an arrow key turns the hue, and moves out.
const TURN = 2;
const STEP = 0.02;
// A knob lifting under the pointer, and a knob going where it is put while it
// isn't held: a press off the knobs, a preset, an arrow key, undo.
const LIFT = `200ms ${cssEase(EASE_SLIDE)}`;
const SLIDE = `350ms ${cssEase(EASE_SLIDE)}`;

export function ColorPad({ doc, edit, end }: EditProps) {
  const { theme, editor } = doc;
  const blank = isBlank(theme);
  const colors = blank ? [] : derivedColors(theme);
  const pad = useRef<HTMLDivElement>(null);
  // The knob being dragged, and how far from its centre it was grabbed.
  const dragging = useRef<{ index: number; offset: Point } | null>(null);
  // Whether a knob follows the pointer as it is, without sliding to it.
  const [holding, setHolding] = useState(false);
  // Whether any knob is under the pointer: they all lift together.
  const [hovered, setHovered] = useState(false);
  // Whether the pad has been drawn once. A knob that comes after (the first
  // press on a blank pad, or a colour added) grows in. Those there as the
  // picker opens don't, as the picker itself is coming in.
  const drawn = useRef(false);
  useEffect(() => {
    drawn.current = true;
  }, []);

  const pointAt = (event: PointerEvent): Point => {
    const box = pad.current!.getBoundingClientRect();
    return {
      x: ((event.clientX - box.left) / box.width) * 2 - 1,
      y: ((event.clientY - box.top) / box.height) * 2 - 1
    };
  };
  const drag = (event: PointerEvent) => {
    const { index, offset } = dragging.current!;
    const { x, y } = pointAt(event);
    edit(dragKnob(doc, index, { x: x - offset.x, y: y - offset.y }), true);
  };
  const down = (event: PointerEvent) => {
    // The buttons over the pad are their own.
    if (event.button !== 0 || (event.target as HTMLElement).closest("button")) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const knob = (event.target as HTMLElement).closest<HTMLElement>("[data-knob]");
    if (knob) {
      const index = Number(knob.dataset.knob);
      const at = knobAt(colors[index], editor);
      const { x, y } = pointAt(event);
      dragging.current = { index, offset: { x: x - at.x, y: y - at.y } };
      setHolding(true);
    } else {
      // Not held yet, so the primary slides to the press. It is held from the
      // first move on, or it would lag behind the pointer.
      dragging.current = { index: 0, offset: { x: 0, y: 0 } };
      drag(event);
    }
  };
  const move = (event: PointerEvent) => {
    if (!dragging.current) return;
    setHolding(true);
    drag(event);
  };
  const up = () => {
    if (!dragging.current) return;
    dragging.current = null;
    setHolding(false);
    end();
  };
  const key = (event: KeyboardEvent, index: number) => {
    const [turn, out] =
      event.key === "ArrowLeft"
        ? [-TURN, 0]
        : event.key === "ArrowRight"
          ? [TURN, 0]
          : event.key === "ArrowUp"
            ? [0, STEP]
            : event.key === "ArrowDown"
              ? [0, -STEP]
              : [null, null];
    if (turn === null) return;
    event.preventDefault();
    edit(nudgeKnob(doc, index, turn, out));
  };

  // The knobs lift under the pointer and while held, and the buttons under
  // them take no hover then, as a knob is what is in hand. A knob that goes
  // (undo back to a blank theme) leaves without saying so, so hover counts
  // only while there are knobs.
  const lifted = (hovered && !blank) || holding;
  return (
    <div
      ref={pad}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      className={cn("relative size-85 shrink-0 touch-none select-none", holding && "cursor-grabbing")}
    >
      {/* The panel of dots the knobs sit over. The knobs may stand out of it. */}
      <div
        aria-hidden
        className="absolute inset-0 rounded-lg bg-(--picker-panel)"
        style={{
          backgroundImage: "radial-gradient(circle, var(--picker-dots) 0.53px, transparent 0.75px)",
          backgroundSize: "4.25px 4.25px"
        }}
      />
      <div className="absolute inset-x-0 top-4">
        <AppearanceButtons
          appearance={theme.appearance}
          quiet={lifted}
          onChange={(appearance) => edit(withAppearance(doc, appearance))}
        />
      </div>
      <div className="absolute inset-x-0 bottom-4 flex justify-center gap-2 text-(--picker-symbol)">
        <PickerButton
          label="Remove Colour"
          disabled={theme.colors <= 1}
          quiet={lifted}
          onClick={() => edit(withColors(doc, theme.colors - 1))}
        >
          <Minus size={17} strokeWidth={2.25} />
        </PickerButton>
        <PickerButton
          label="Add Colour"
          disabled={blank || theme.colors >= MAX_COLORS}
          quiet={lifted}
          onClick={() => edit(withColors(doc, theme.colors + 1))}
        >
          <Plus size={17} strokeWidth={2.25} />
        </PickerButton>
      </div>
      {/* Over the buttons, as the thing being moved: it is never hidden. */}
      {colors.map((color, index) => {
        const { x, y } = knobAt(color, editor);
        const primary = index === 0;
        const style: CSSProperties = {
          left: `calc(50% + ${x} * 50%)`,
          top: `calc(50% + ${y} * 50%)`,
          zIndex: primary ? 2 : 1,
          background: colorCss(color),
          scale: lifted ? "1.1" : "1",
          boxShadow: `0 ${lifted ? 4 : 2}px ${lifted ? 8 : 4}px var(--picker-shadow)`,
          transition: [
            `scale ${LIFT}`,
            `box-shadow ${LIFT}`,
            ...(holding ? [] : [`left ${SLIDE}`, `top ${SLIDE}`])
          ].join()
        };
        return (
          <Knob
            key={index}
            grows={drawn.current}
            data-knob={index}
            role="slider"
            tabIndex={0}
            aria-label={primary ? "Primary Colour" : `Colour ${index + 1}`}
            aria-valuemin={0}
            aria-valuemax={360}
            aria-valuenow={Math.round(color.hue * 360)}
            onKeyDown={(event) => key(event, index)}
            onPointerEnter={() => setHovered(true)}
            onPointerLeave={() => setHovered(false)}
            className={cn(
              "absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-white outline-none focus-visible:ring-2 focus-visible:ring-white/60 motion-reduce:transition-none",
              holding ? "cursor-grabbing" : "cursor-grab",
              // A ring of 5pt (or 3pt) on the edge of a 45pt (or 27pt) disc.
              primary ? "size-11.25 border-5" : "size-6.75 border-3"
            )}
            style={style}
          />
        );
      })}
    </div>
  );
}

// A knob, which grows in if it comes once the pad is drawn (`grows`, as it
// mounts). The keyframes are in index.css.
function Knob({ grows, className, ...props }: { grows: boolean } & ComponentProps<"div">) {
  const [growing] = useState(grows);
  return <div {...props} className={cn(className, growing && "picker-knob-in")} />;
}
