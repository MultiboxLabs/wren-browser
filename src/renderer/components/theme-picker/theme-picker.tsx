// The picker for a space's theme: the colour pad, with the appearances over
// its top, then the presets, then intensity at the bottom left and noise at
// the bottom right. It is drawn with the theme it edits, so it previews it,
// and its controls are light or dark as that theme is (palette.ts).
//
// `value` is where it starts: the picker keeps what it is editing, and tells
// `onChange` of each change (a drag's too, as it goes). Undo and redo are ⌘Z
// and ⇧⌘Z, a gesture being one step.

import { useEffect, useRef, useState } from "react";
import type { SpaceTheme } from "@/ipc";
import { cn } from "@/utils/cn";
import { contentScheme } from "@/utils/theme";
import { type Doc, editorFor } from "@/utils/theme-pad";
import { pageOf } from "@/utils/theme-presets";
import { ThemeSwatch } from "@/components/theme-swatch";
import { ColorPad } from "./color-pad";
import { IntensitySlider } from "./intensity-slider";
import { NoiseDial } from "./noise-dial";
import { pickerPalette } from "./palette";
import { PresetRow } from "./preset-row";

export function ThemePicker({
  value,
  onChange,
  className
}: {
  value: SpaceTheme;
  onChange: (theme: SpaceTheme) => void;
  /** For its box: its corners, when it sits in another. */
  className?: string;
}) {
  const [doc, setDoc] = useState<Doc>(() => ({ theme: value, editor: editorFor(value) }));
  const [page, setPage] = useState(() => pageOf(value));
  // The undo history; `gesture` is whether one is still under way.
  const past = useRef<Doc[]>([]);
  const future = useRef<Doc[]>([]);
  const gesture = useRef(false);

  const edit = (next: Doc, ongoing = false) => {
    if (!gesture.current) {
      past.current.push(doc);
      future.current = [];
    }
    gesture.current = ongoing;
    setDoc(next);
    onChange(next.theme);
  };
  const end = () => {
    gesture.current = false;
  };
  const travel = (from: Doc[], to: Doc[]) => {
    const next = from.pop();
    if (!next) return;
    to.push(doc);
    gesture.current = false;
    setDoc(next);
    onChange(next.theme);
  };

  // The latest of these, for the listener, which is not remade as they change.
  const latest = useRef(travel);
  latest.current = travel;
  useEffect(() => {
    const undo = (event: KeyboardEvent) => {
      if (!event.metaKey || event.key.toLowerCase() !== "z") return;
      // Text being typed in the dialog has its own undo.
      if ((event.target as HTMLElement).closest("input, textarea")) return;
      event.preventDefault();
      if (event.shiftKey) latest.current(future.current, past.current);
      else latest.current(past.current, future.current);
    };
    addEventListener("keydown", undo);
    return () => removeEventListener("keydown", undo);
  }, []);

  return (
    <ThemeSwatch
      as="div"
      theme={doc.theme}
      className={cn("rounded-[16px] backdrop-blur-2xl", className)}
      contentClassName="w-full"
    >
      <div className="flex flex-col items-center gap-4 p-2" style={pickerPalette(contentScheme(doc.theme))}>
        <ColorPad doc={doc} edit={edit} end={end} />
        <PresetRow doc={doc} edit={edit} page={page} onPage={setPage} />
        <div className="flex items-center gap-4 px-2 pb-1">
          <IntensitySlider doc={doc} edit={edit} end={end} />
          <NoiseDial doc={doc} edit={edit} end={end} />
        </div>
      </div>
    </ThemeSwatch>
  );
}
