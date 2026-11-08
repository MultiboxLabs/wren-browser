// wren://design, in a tab: Wren's controls, colours, type and corners, laid
// out on the window as a space's theme draws it, for working on how they
// look. The theme is picked here, with the picker the Library's spaces use
// (components/space-fields.tsx), and nothing the page picks reaches a space.
// The samples are in samples.tsx.

import { useMemo, useState } from "react";
import type { SpaceTheme } from "@/ipc";
import { ThemePopover } from "@/components/space-fields";
import { ThemeLayers, ThemeSwatch } from "@/components/theme-swatch";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import { NEW_SPACE, personal, type Space } from "@/state/space";
import { useWindowTheme } from "@/state/window";
import { useWindowAspect } from "@/utils/aspect";
import { contentScheme, primaryHex } from "@/utils/theme";
import { Samples } from "./samples";

// Where the theme picked last is kept, so a reload keeps it. The page's
// own, in the tab's profile: a convenience, so the page works without it.
const KEPT = "design.theme";

function keptTheme(): SpaceTheme {
  try {
    const kept = localStorage.getItem(KEPT);
    if (kept) return JSON.parse(kept) as SpaceTheme;
  } catch {
    // Storage that is blocked or holds something else starts afresh.
  }
  return personal.theme;
}

function keep(theme: SpaceTheme) {
  try {
    localStorage.setItem(KEPT, JSON.stringify(theme));
  } catch {
    // Not kept: the page still draws it.
  }
}

// The page as a space being made: its colours are drawn at once as they are
// picked, not tweened to (`themeKey`).
const drawn = (theme: SpaceTheme): Space => ({
  ...personal,
  id: NEW_SPACE,
  theme,
  color: primaryHex(theme),
  scheme: contentScheme(theme)
});

export function Design() {
  const [theme, setTheme] = useState(keptTheme);
  const space = useMemo(() => drawn(theme), [theme]);
  useWindowTheme(space);
  const pick = (next: SpaceTheme) => {
    setTheme(next);
    keep(next);
  };
  return (
    <TooltipProvider>
      <Window theme={theme} />
      <main className="relative mx-auto flex max-w-180 flex-col gap-10 px-6 py-12">
        <header className="flex items-end justify-between gap-6">
          <div className="flex flex-col gap-1">
            <h1 className="text-[22px] font-semibold">Design</h1>
            <p className="text-fg-2">Wren’s controls, drawn on a space’s theme. Pick one to see them on it.</p>
          </div>
          <ThemePopover
            theme={theme}
            onChange={pick}
            trigger={
              <Button shape="none" className="h-9 w-28 rounded-field">
                <ThemeSwatch theme={theme} lifted className="h-9 w-28 rounded-field" contentClassName="font-medium">
                  Theme
                </ThemeSwatch>
              </Button>
            }
          />
        </header>
        <Samples />
      </main>
    </TooltipProvider>
  );
}

// The window under the page, as the space's window draws it over its blur:
// a tab has no blur, so a stand-in for it is under the theme.
function Window({ theme }: { theme: SpaceTheme }) {
  const aspect = useWindowAspect();
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0">
      <ThemeLayers theme={theme} layout={{ aspect, material: 1 }} />
    </div>
  );
}
