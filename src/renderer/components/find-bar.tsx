// The find bar, at the active page's top right: the string to look for, how
// many matches it has and which is current, and the buttons to step through
// them and to end the find. Chromium finds (ipc/find.ts) and decides when one
// opens, by ⌘F or Find Next, and when it ends; Return steps, Shift-Return
// steps back, Control-Return clicks the current match, and Escape ends it.

import { ChevronDown, ChevronUp, X } from "lucide-react";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { Button } from "./ui/button";
import { find } from "@/ipc";
import { type FindState, useFind } from "@/state/find";

/** The bar of the find open on `tab`, if one is: with that tab alone, as Chrome's is. */
export function FindBar({ tab }: { tab: number }) {
  const open = useFind();
  return open?.request?.tab === tab ? <FindField find={open} /> : null;
}

function FindField({ find: { bar, request, claim } }: { find: FindState }) {
  const input = useRef<HTMLInputElement>(null);
  // What the field holds: what the user types, ahead of Chromium's word on
  // it, and what a find opening has, which may be a selection in the page.
  // The field takes the keyboard only when the opening asks it to: a find
  // that opens by itself, as a tab with one comes back, leaves it where it is.
  const [text, setText] = useState(bar.query);
  useEffect(() => {
    if (!request || !claim()) return;
    setText(request.query);
    if (!request.focus) return;
    input.current?.focus();
    input.current?.select();
  }, [request?.key]);

  const matches = bar.count > 0;
  // Nothing is said of a string that is empty, or has no result yet.
  const tally = text && bar.count >= 0 ? `${bar.active}/${bar.count}` : "";

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Enter") {
      event.preventDefault();
      if (event.ctrlKey) find.end(true);
      else if (matches) find.step(event.shiftKey);
    } else if (event.key === "Escape") {
      event.preventDefault();
      find.end();
    }
  };

  return (
    <div
      role="search"
      // Over the page: light or dark as the system is, not the space.
      data-scheme="system"
      className="find-bar no-drag absolute top-2.5 right-2.5 z-10 flex h-10 w-75 items-center gap-0.5 pr-1.5 pl-3.5"
    >
      <input
        ref={input}
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          find.set(event.target.value);
        }}
        onKeyDown={onKeyDown}
        aria-label="Find in Page"
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        className="mr-1.5 min-w-0 flex-1 bg-transparent text-omnibox-row font-semibold text-omnibox-typed outline-none select-text selection:bg-omnibox-text-selection"
      />
      <span aria-live="polite" className="mr-1 text-caption text-omnibox-dim tabular-nums">
        {tally}
      </span>
      <Button icon={ChevronUp} label="Previous Match" disabled={!matches} onClick={() => find.step(true)} />
      <Button icon={ChevronDown} label="Next Match" disabled={!matches} onClick={() => find.step(false)} />
      <Button icon={X} label="Close" onClick={() => find.end()} />
    </div>
  );
}
