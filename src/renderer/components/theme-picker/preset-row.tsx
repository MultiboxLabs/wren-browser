// A row of the preset colours, a page of nine at a time. Choosing one makes it
// the theme's primary.

import { ChevronLeft, ChevronRight } from "lucide-react";
import { colorCss, PRESET_PAGES } from "../../utils/theme";
import { withPrimary } from "../../utils/theme-pad";
import { cn } from "../../utils/cn";
import { Button } from "../ui/button";
import { Tooltip } from "../ui/tooltip";
import type { EditProps } from "./edit";

export const PAGE_COUNT = PRESET_PAGES.length;

const near = (a: number, b: number) => Math.abs(a - b) < 0.005;

export function PresetRow({
  doc,
  edit,
  page,
  onPage
}: Pick<EditProps, "doc" | "edit"> & {
  page: number;
  onPage: (page: number) => void;
}) {
  const { primary } = doc.theme;
  const { swatches } = PRESET_PAGES[page];
  return (
    <div className="flex items-center justify-between">
      <Button
        icon={ChevronLeft}
        iconTone="inherit"
        label="Move to previous preset page."
        onClick={() => onPage((page + PAGE_COUNT - 1) % PAGE_COUNT)}
        className="size-5"
      />
      <div className="flex gap-1.25">
        {swatches.map(({ label, color }) => {
          const chosen =
            near(color.brightness, primary.brightness) &&
            near(color.saturation, primary.saturation) &&
            (color.saturation < 0.01 || near(color.hue, primary.hue));
          return (
            <Tooltip key={label} label={label}>
              <button
                type="button"
                aria-label={label}
                aria-pressed={chosen}
                onClick={() => edit(withPrimary(doc, color))}
                className={cn(
                  "size-4.5 rounded-full shadow-[0_0_0_1px_rgb(0_0_0/0.12)] outline-none focus-visible:ring-2 focus-visible:ring-white/70",
                  chosen && "ring-2 ring-white"
                )}
                style={{ background: colorCss(color) }}
              />
            </Tooltip>
          );
        })}
      </div>
      <Button
        icon={ChevronRight}
        iconTone="inherit"
        label="Move to next preset page."
        onClick={() => onPage((page + 1) % PAGE_COUNT)}
        className="size-5"
      />
    </div>
  );
}
