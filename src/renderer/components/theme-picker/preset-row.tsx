// A row of the preset colours, a page of nine at a time. Choosing one makes it
// the theme's primary.

import { ChevronLeft, ChevronRight } from "lucide-react";
import { colorCss, PRESET_PAGES } from "@/utils/theme";
import { withPrimary } from "@/utils/theme-pad";
import { cn } from "@/utils/cn";
import { Tooltip } from "@/components/ui/tooltip";
import type { EditProps } from "./edit";

const PAGE_COUNT = PRESET_PAGES.length;

const near = (a: number, b: number) => Math.abs(a - b) < 0.005;

const PAGE_BUTTON =
  "grid size-6 place-items-center rounded-md opacity-55 outline-none hover:bg-current/15 hover:opacity-100 focus-visible:ring-2 focus-visible:ring-current/50";

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
      <Tooltip label="Move to previous preset page.">
        <button
          type="button"
          aria-label="Move to previous preset page."
          onClick={() => onPage((page + PAGE_COUNT - 1) % PAGE_COUNT)}
          className={PAGE_BUTTON}
        >
          <ChevronLeft size={22} strokeWidth={1.5} />
        </button>
      </Tooltip>
      <div className="flex gap-1.5">
        {swatches.map(({ label, color }) => {
          const chosen =
            near(color.brightness, primary.brightness) &&
            near(color.saturation, primary.saturation) &&
            (color.saturation < 0.01 || near(color.hue, primary.hue));
          const css = colorCss(color);
          return (
            <Tooltip key={label} label={label}>
              <button
                type="button"
                aria-label={label}
                aria-pressed={chosen}
                onClick={() => edit(withPrimary(doc, color))}
                className={cn(
                  "size-6 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-current/50",
                  chosen && "ring-2 ring-white ring-offset-1 ring-offset-transparent"
                )}
                // Edged by a darker ring of its own colour, as a bezel.
                style={{
                  background: css,
                  boxShadow: `inset 0 0 0 2px color-mix(in oklab, ${css} 78%, black)`
                }}
              />
            </Tooltip>
          );
        })}
      </div>
      <Tooltip label="Move to next preset page.">
        <button
          type="button"
          aria-label="Move to next preset page."
          onClick={() => onPage((page + 1) % PAGE_COUNT)}
          className={PAGE_BUTTON}
        >
          <ChevronRight size={22} strokeWidth={1.5} />
        </button>
      </Tooltip>
    </div>
  );
}
