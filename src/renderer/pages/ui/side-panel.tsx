// Chromium's side panel, at the window's right: a header of ours, and the
// panel itself below it (a <wren-view>, once there is a Browser).

import { BookOpen, Bookmark, ChevronDown, Glasses, History, X } from "lucide-react";
import { IconButton } from "../../components/ui/icon-button";
import { Menu } from "../../components/ui/menu";

export const sidePanels = [
  { id: "reading-list", label: "Reading List", icon: Glasses },
  { id: "bookmarks", label: "Bookmarks", icon: Bookmark },
  { id: "history", label: "History", icon: History },
  { id: "reading-mode", label: "Reading Mode", icon: BookOpen }
] as const;

export type SidePanelId = (typeof sidePanels)[number]["id"];

export const SIDE_PANEL_WIDTH = { min: 280, max: 640, initial: 360 };

export function SidePanel({
  panel,
  width,
  onSwitch,
  onClose
}: {
  panel: SidePanelId;
  width: number;
  onSwitch: (panel: SidePanelId) => void;
  onClose: () => void;
}) {
  const { label, icon: Icon } = sidePanels.find((each) => each.id === panel)!;
  return (
    <section style={{ width }} className="card no-drag flex shrink-0 flex-col overflow-hidden">
      <header className="flex h-10 shrink-0 items-center gap-1 pr-1.5 pl-1.5">
        <Menu
          items={[...sidePanels]}
          checked={panel}
          onSelect={onSwitch}
          trigger={
            <button
              type="button"
              className="flex h-7 items-center gap-1.75 rounded-control px-2 font-semibold hover:bg-hover data-[state=open]:bg-pressed"
            >
              <Icon size={15} strokeWidth={1.75} className="glyph-2" />
              {label}
              <ChevronDown size={13} strokeWidth={2} className="glyph-2" />
            </button>
          }
        />
        <div className="flex-1" />
        <IconButton icon={X} label="Close Side Panel" size={15} onClick={onClose} />
      </header>
      {/* The panel's page goes here. */}
      <div className="min-h-0 flex-1" />
    </section>
  );
}
