// Chromium's side panel, at the window's right: a header of ours, and the
// panel itself below it (a <wren-view>, once there is a Browser).

import { BookOpen, Bookmark, ChevronDown, Glasses, History, X } from "lucide-react";
import { useRef } from "react";
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
              <Icon size={15} strokeWidth={1.75} className="text-fg-2" />
              {label}
              <ChevronDown size={13} strokeWidth={2} className="text-fg-2" />
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

/** The gap between the page and the side panel, which resizes the panel. */
export function SidePanelHandle({ onResize }: { onResize: (width: number) => void }) {
  const start = useRef<{ x: number; width: number } | null>(null);
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      className="no-drag group grid w-2.5 shrink-0 cursor-col-resize place-items-center"
      onPointerDown={(event) => {
        const panel = event.currentTarget.nextElementSibling as HTMLElement;
        start.current = { x: event.clientX, width: panel.offsetWidth };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (!start.current) return;
        const width = start.current.width + start.current.x - event.clientX;
        onResize(Math.round(Math.min(SIDE_PANEL_WIDTH.max, Math.max(SIDE_PANEL_WIDTH.min, width))));
      }}
      onPointerUp={() => (start.current = null)}
      onPointerCancel={() => (start.current = null)}
    >
      <div className="h-7 w-0.75 rounded-full bg-fg-3 opacity-0 group-hover:opacity-100 group-active:opacity-100" />
    </div>
  );
}
