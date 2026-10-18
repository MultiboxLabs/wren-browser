// Chromium's side panel, at the window's right: a header of ours, and the
// panel itself below it, in a <wren-view>.

import { BookOpen, Bookmark, ChevronDown, Glasses, PanelRight, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "./ui/button";
import { Menu } from "./ui/menu";
import { ResizeHandle } from "./ui/resize-handle";
import { sidePanel, type SidePanelState } from "../ipc";

/** The panels the menu offers, by Chromium's names for them. */
export const sidePanels = [
  { id: "ReadingList", label: "Reading List", icon: Glasses },
  { id: "Bookmarks", label: "Bookmarks", icon: Bookmark },
  { id: "ReadAnything", label: "Reading Mode", icon: BookOpen }
] as const;

export type SidePanelId = (typeof sidePanels)[number]["id"];

/** Chromium makes no panel narrower than 360 points. */
export const SIDE_PANEL_WIDTH = { min: 360, max: 640, initial: 360 };

export function SidePanel({
  browser,
  panel: { id: panel, title, icon, width: chromiumWidth }
}: {
  /** The Browser's ID, which names its panel's element. */
  browser: number;
  /** The open panel: one of the menu's, by Chromium's name for it, or another (an extension's, Customize Chromium). */
  panel: SidePanelState;
}) {
  // Follows the user's drag at once, and Chromium's width otherwise: the
  // one it keeps for each kind of panel.
  const [width, setWidth] = useState(chromiumWidth > 0 ? chromiumWidth : SIDE_PANEL_WIDTH.initial);
  useEffect(() => {
    if (chromiumWidth > 0) setWidth(chromiumWidth);
  }, [chromiumWidth]);
  const { label, icon: Icon } = sidePanels.find((each) => each.id === panel) ?? { label: title, icon: PanelRight };
  return (
    <>
      <ResizeHandle
        width={width}
        range={SIDE_PANEL_WIDTH}
        edge="left"
        grip
        className="w-2.5"
        onResize={(width) => {
          setWidth(width);
          sidePanel.setWidth(width);
        }}
      />
      <section style={{ width }} className="card no-drag flex shrink-0 flex-col overflow-hidden">
        <header className="flex h-10 shrink-0 items-center gap-1 pr-1.5 pl-1.5">
          <Menu
            items={[...sidePanels]}
            checked={panel as SidePanelId}
            onSelect={sidePanel.show}
            trigger={
              <Button icon={icon ? undefined : Icon} iconSize={15} className="font-semibold">
                {icon && <img aria-hidden src={icon} width={16} height={16} />}
                {label}
                <ChevronDown size={13} strokeWidth={2} className="glyph-2" />
              </Button>
            }
          />
          <div className="flex-1" />
          <Button icon={X} label="Close Side Panel" iconSize={15} onClick={sidePanel.close} />
        </header>
        <wren-view data-id={`sidepanel-${browser}`} className="block min-h-0 flex-1" />
      </section>
    </>
  );
}
