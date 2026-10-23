// The address of the link under the pointer, or of the link with the
// keyboard, in a capsule at the bottom left of a tab's page, as Chrome's
// status bubble shows it. Chromium says what it is (ipc/browser.ts); its
// loading line is left out. It follows Chrome's timing: shown 80 ms after
// there is a link, faded 250 ms after there is none, so passing from one
// link to the next does not flicker, at most a third of the page and 360px
// wide, and grown to fit a long address once the pointer has rested on its
// link for 1.6 s. Cut short, an address loses its middle, as Arc's does,
// so its end (a query, a file) still shows. Clicks pass through it.

import { useEffect, useState } from "react";
import { browser, hasApp } from "../ipc";
import { cn } from "../utils/cn";
import { linkAddress } from "../utils/url";

const SHOW = 80;
const HIDE = 250;
const GROW = 1600;
// How much of the end of an address stays when it is cut short.
const TAIL = 24;

export function LinkStatus({ tab }: { tab: number }) {
  const link = useLink(tab);
  // The last link, kept while the capsule fades.
  const [shown, setShown] = useState("");
  const [visible, setVisible] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setExpanded(false);
    if (!link) {
      const hide = setTimeout(() => setVisible(false), HIDE);
      return () => clearTimeout(hide);
    }
    setShown(linkAddress(link));
    const show = setTimeout(() => setVisible(true), SHOW);
    const grow = setTimeout(() => setExpanded(true), GROW);
    return () => {
      clearTimeout(show);
      clearTimeout(grow);
    };
  }, [link]);

  return (
    <div className="pointer-events-none absolute inset-x-2.5 bottom-2.5 z-10 flex">
      <div
        aria-hidden
        className={cn(
          "link-status flex h-6 min-w-0 items-center px-2 text-subtitle leading-none font-medium whitespace-nowrap transition-[opacity,max-width] ease-out",
          visible ? "opacity-100 duration-100" : "opacity-0 duration-150",
          expanded ? "max-w-full" : "max-w-[min(360px,max(33%,120px))]"
        )}
      >
        <span className="truncate">{shown.length > TAIL * 2 ? shown.slice(0, -TAIL) : shown}</span>
        {shown.length > TAIL * 2 && <span className="shrink-0">{shown.slice(-TAIL)}</span>}
      </div>
    </div>
  );
}

// The address of the link under the pointer in a tab's page, or null.
function useLink(tab: number) {
  const [link, setLink] = useState<string | null>(null);
  useEffect(() => {
    if (!hasApp) return;
    // Chromium's word since mounting is newer than the answer.
    let heard = false;
    browser.status(tab).then(
      (next) => heard || setLink(next),
      () => {}
    );
    const off = browser.onStatus((status) => {
      if (status.tab !== tab) return;
      heard = true;
      setLink(status.link);
    });
    return () => {
      heard = true;
      off();
    };
  }, [tab]);
  return link;
}
