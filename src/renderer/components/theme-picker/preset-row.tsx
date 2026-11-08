// The preset colours (utils/theme-presets.ts): a strip of round swatches that
// shows a page of nine at a time, faded at its ends, and slides from page to
// page between a chevron either side. A preset of more than one colour is
// drawn as a gradient of them. Choosing one gives the theme its colours, and
// the one the theme has carries a dot, as the system's accent colours do.

import { ChevronLeft, ChevronRight } from "lucide-react";
import { motion } from "motion/react";
import type { CSSProperties } from "react";
import { press } from "@/components/ui/press";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/utils/cn";
import { cssEase, EASE_SLIDE } from "@/utils/motion";
import { colorCss, colorScheme, hueOffsets, rotate } from "@/utils/theme";
import { withPreset } from "@/utils/theme-pad";
import { isPreset, PRESET_PAGES, type PresetSwatch } from "@/utils/theme-presets";
import type { EditProps } from "./edit";
import { PickerButton } from "./picker-button";

const SWATCH = 24;
const GAP = 5.5;
// What a page slides by: nine swatches and their gaps.
const PAGE_STEP = 9 * (SWATCH + GAP);
// Room either side of a page for a swatch that grows under the pointer, and
// for the fade at the strip's ends.
const HEADROOM = SWATCH * 0.075;
const STRIP = 9 * SWATCH + 8 * GAP + 2 * HEADROOM + 2 * GAP;

// A swatch's fill: its colour, or a gradient of its colours, lighter.
function fill({ color, colors, wheel }: PresetSwatch): CSSProperties {
  if (colors === 1) return { background: colorCss(color) };
  const stops = hueOffsets({ colors, wheel }).map((offset) => colorCss(rotate(color, offset)));
  return { backgroundImage: `linear-gradient(to bottom right, ${stops.join()})`, opacity: 0.85 };
}

export function PresetRow({
  doc,
  edit,
  page,
  onPage
}: Pick<EditProps, "doc" | "edit"> & {
  page: number;
  onPage: (page: number) => void;
}) {
  return (
    <div className="flex h-8 items-center justify-center">
      <PickerButton
        label="Previous Presets"
        disabled={page === 0}
        onClick={() => onPage(page - 1)}
        className="text-(--picker-chevron)"
      >
        <ChevronLeft size={18} strokeWidth={2.25} />
      </PickerButton>
      <div
        className="relative h-8 shrink-0 overflow-hidden"
        style={{
          width: STRIP,
          maskImage:
            "linear-gradient(to right, transparent 1.5px, black 10px, black calc(100% - 10px), transparent calc(100% - 1.5px))"
        }}
      >
        <div
          className="absolute inset-y-0 left-0 flex items-center transition-transform duration-350 motion-reduce:transition-none"
          style={{
            gap: GAP,
            transform: `translateX(${GAP + HEADROOM - PAGE_STEP * page}px)`,
            transitionTimingFunction: cssEase(EASE_SLIDE)
          }}
        >
          {PRESET_PAGES.flatMap((swatches, index) =>
            swatches.map((preset) => {
              const shown = index === page;
              const chosen = isPreset(doc.theme, preset);
              return (
                <Tooltip key={preset.label} label={shown ? preset.label : undefined}>
                  <motion.button
                    {...press(0.9)}
                    type="button"
                    aria-label={preset.label}
                    aria-pressed={chosen}
                    aria-hidden={!shown}
                    tabIndex={shown ? 0 : -1}
                    onClick={() => edit(withPreset(doc, preset))}
                    className="relative grid size-6 shrink-0 place-items-center rounded-full outline-none transition-[scale] duration-200 hover:scale-[1.075] focus-visible:ring-2 focus-visible:ring-(--picker-foreground)"
                  >
                    <span aria-hidden className="absolute inset-0 rounded-full" style={fill(preset)} />
                    {/* A ring that darkens the swatch's edge, as a bezel. */}
                    <span
                      aria-hidden
                      className="absolute inset-0 rounded-full shadow-[inset_0_0_0_2px_rgb(0_0_0/0.1)] mix-blend-multiply"
                    />
                    {chosen && (
                      <span
                        aria-hidden
                        className={cn(
                          "relative size-2 rounded-full",
                          colorScheme(preset.color) === "light" ? "bg-black/55" : "bg-white"
                        )}
                      />
                    )}
                  </motion.button>
                </Tooltip>
              );
            })
          )}
        </div>
      </div>
      <PickerButton
        label="Next Presets"
        disabled={page === PRESET_PAGES.length - 1}
        onClick={() => onPage(page + 1)}
        className="text-(--picker-chevron)"
      >
        <ChevronRight size={18} strokeWidth={2.25} />
      </PickerButton>
    </div>
  );
}
