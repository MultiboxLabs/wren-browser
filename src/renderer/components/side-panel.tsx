// Chromium's side panel, at the window's right: a header of ours, and the
// panel itself below it, in a <wren-view>.

import { BookOpen, Bookmark, ChevronDown, Glasses, History, PanelRight, X } from "lucide-react";
import { Button } from "./ui/button";
import { Menu } from "./ui/menu";

/** The panels the menu offers, by Chromium's names for them. */
export const sidePanels = [
  { id: "ReadingList", label: "Reading List", icon: Glasses },
  { id: "Bookmarks", label: "Bookmarks", icon: Bookmark },
  { id: "History", label: "History", icon: History },
  { id: "ReadAnything", label: "Reading Mode", icon: BookOpen }
] as const;

export type SidePanelId = (typeof sidePanels)[number]["id"];

/** Chromium makes no panel narrower than 360 points. */
export const SIDE_PANEL_WIDTH = { min: 360, max: 640, initial: 360 };

export function SidePanel({
  browser,
  panel,
  title,
  width,
  onSwitch,
  onClose
}: {
  /** The Browser's ID, which names its panel's element. */
  browser: number;
  /** Chromium's name for the open panel: one of the menu's, or another (an extension's, Customize Chromium). */
  panel: string;
  title: string;
  width: number;
  onSwitch: (panel: SidePanelId) => void;
  onClose: () => void;
}) {
  const { label, icon: Icon } = sidePanels.find((each) => each.id === panel) ?? { label: title, icon: PanelRight };
  return (
    <section style={{ width }} className="card no-drag flex shrink-0 flex-col overflow-hidden">
      <header className="flex h-10 shrink-0 items-center gap-1 pr-1.5 pl-1.5">
        <Menu
          items={[...sidePanels]}
          checked={panel as SidePanelId}
          onSelect={onSwitch}
          trigger={
            <Button icon={Icon} iconSize={15} className="font-semibold">
              {label}
              <ChevronDown size={13} strokeWidth={2} className="glyph-2" />
            </Button>
          }
        />
        <div className="flex-1" />
        <Button icon={X} label="Close Side Panel" iconSize={15} onClick={onClose} />
      </header>
      <wren-view data-id={`sidepanel-${browser}`} className="block min-h-0 flex-1" />
    </section>
  );
}
