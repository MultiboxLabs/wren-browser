// What a peek has beside its page (src/main/peeks/): the overlay over the
// tab behind it, which closes it when clicked, and its three buttons, which
// close it, make it a tab of the list, or set it down in a split beside the
// page behind it. tab-view.tsx lays out the peek's page and the tab behind
// it.

import { Columns2, Maximize2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { type Peek, peeks } from "@/ipc";

/**
 * The overlay over the tab behind `peek`, under the peek's page, and the
 * peek's buttons, over it. Split is left out while the tab behind is in a
 * split already (`canSplit`), as a split has no third side.
 */
export function PeekCover({ peek, canSplit }: { peek: Peek; canSplit: boolean }) {
  // What a press asks of the app for the peek.
  const ask = (call: (tab: number) => Promise<unknown>) => () => void call(peek.tab).catch(() => {});
  return (
    <>
      <div aria-hidden className="no-drag absolute inset-0 z-1" onClick={ask(peeks.close)} />
      <div data-scheme="system" className="no-drag absolute top-2 right-2 z-3 flex gap-1">
        <Button variant="raised" icon={X} label="Close" onClick={ask(peeks.close)} />
        <Button variant="raised" icon={Maximize2} label="Open as Tab" onClick={ask(peeks.expand)} />
        {canSplit && <Button variant="raised" icon={Columns2} label="Open in Split View" onClick={ask(peeks.split)} />}
      </div>
    </>
  );
}
