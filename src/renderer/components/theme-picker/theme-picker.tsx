// The picker for a space's theme, laid out as Arc's: the appearance on top, the
// colour pad with its presets, then intensity at the bottom left and noise at
// the bottom right. It is drawn with the theme it edits, so it previews it.
//
// `value` is where it starts: the picker keeps what it is editing, and tells
// `onChange` of each change (a drag's too, as it goes). Undo and redo are ⌘Z
// and ⇧⌘Z, a gesture being one step.

import { useEffect, useRef, useState } from "react";
import type { SpaceTheme } from "../../ipc";
import { PRESET_PAGES } from "../../utils/theme";
import { type Doc, editorFor, withAppearance } from "../../utils/theme-pad";
import { ThemeSwatch } from "../theme-swatch";
import { AppearanceButtons } from "./appearance-buttons";
import { ColorPad } from "./color-pad";
import { IntensitySlider } from "./intensity-slider";
import { NoiseDial } from "./noise-dial";
import { PresetRow } from "./preset-row";

// The page of presets the primary is on, or the first.
function pageOf({ primary }: SpaceTheme) {
  const found = PRESET_PAGES.findIndex(({ swatches }) =>
    swatches.some(
      ({ color }) =>
        Math.abs(color.hue - primary.hue) < 0.005 &&
        Math.abs(color.saturation - primary.saturation) < 0.005 &&
        Math.abs(color.brightness - primary.brightness) < 0.005
    )
  );
  return Math.max(found, 0);
}

export function ThemePicker({ value, onChange }: { value: SpaceTheme; onChange: (theme: SpaceTheme) => void }) {
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
      aspect={0.7}
      className="w-88 rounded-[26px] backdrop-blur-2xl"
      contentClassName="w-full gap-3.5 p-4"
    >
      <ColorPad
        doc={doc}
        edit={edit}
        end={end}
        top={
          <AppearanceButtons
            appearance={doc.theme.appearance}
            onChange={(appearance) => edit(withAppearance(doc, appearance))}
          />
        }
      />
      <PresetRow doc={doc} edit={edit} page={page} onPage={setPage} />
      <div className="flex items-center justify-between">
        <IntensitySlider doc={doc} edit={edit} end={end} />
        <NoiseDial doc={doc} edit={edit} end={end} />
      </div>
    </ThemeSwatch>
  );
}
