// A card shown beside what the pointer rests on, for as long as the pointer
// is on either or on its way from one to the other, over whatever is there
// (the page too). It looks as a popover does (popover.tsx), without an
// arrow, and is light or dark as the system is. It goes on Escape, a press
// elsewhere, focus moving to a tab's <wren-view> or out of the window, a
// context menu, or a drag of what it is beside.

import { HoverCard as Radix } from "radix-ui";
import { type PointerEvent as ReactPointerEvent, type ReactNode, useEffect, useRef } from "react";
import { cn } from "@/utils/cn";
import { useHoldWhile } from "./hold";
import { useSafeTriangle } from "./safe-triangle";

// How long the pointer may be off the trigger and the card, and off the way
// between them, before the card closes.
const CLOSE_DELAY = 150;

// Closes the card `delay` ms after the pointer leaves its content, even when
// Radix's own close skips it: after selecting text in a field inside the
// card, or after pressing down in the card and releasing the pointer outside.
function useContentLeave(open: boolean, close: () => void, delay: number) {
  const stop = useRef(() => {});
  useEffect(() => {
    if (!open) stop.current();
    return () => stop.current();
  }, [open]);

  const cancel = () => stop.current();

  const leave = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.pointerType === "touch") return;
    stop.current();
    const listeners = new AbortController();
    const { signal } = listeners;
    let timer: number | undefined;
    const end = () => {
      clearTimeout(timer);
      listeners.abort();
      stop.current = () => {};
    };
    const schedule = () => {
      timer = window.setTimeout(() => {
        end();
        close();
      }, delay);
    };
    const onUp = () => {
      listeners.abort();
      schedule();
    };
    stop.current = end;
    if (event.buttons !== 0) {
      window.addEventListener("pointerup", onUp, { once: true, signal });
      window.addEventListener("pointercancel", onUp, { once: true, signal });
      window.addEventListener("pointermove", (move) => move.buttons === 0 && onUp(), { signal });
    } else schedule();
  };

  return { leave, cancel };
}

export function HoverCard({
  open,
  onOpenChange,
  trigger,
  label,
  side = "right",
  align = "start",
  sideOffset = 8,
  className,
  children
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** What the pointer rests on to open it; it must take a ref (a DOM element). */
  trigger: ReactNode;
  /** What it is, for assistive technology. */
  label: string;
  /** Which side of the trigger it opens on, if there is room; the right by default. */
  side?: "top" | "right" | "bottom" | "left";
  /** Where along that side, from the trigger's start by default. */
  align?: "start" | "center" | "end";
  /** How far from the trigger. */
  sideOffset?: number;
  /** Its own classes: say, a radius (`--radius-popover`) its rows nest in. */
  className?: string;
  children: ReactNode;
}) {
  useHoldWhile(open);
  const content = useRef<HTMLDivElement>(null);
  const close = () => onOpenChange(false);
  const triangle = useSafeTriangle(open, content, close, CLOSE_DELAY);
  const contentLeave = useContentLeave(open, close, CLOSE_DELAY);
  // A click on a tab's <wren-view> sends no pointerdown to this page, and
  // Radix's HoverCard ignores outside focus. Instead, focus moves to the
  // <wren-view> element or leaves this web view altogether.
  useEffect(() => {
    if (!open) return;
    const listeners = new AbortController();
    const { signal } = listeners;
    const dismiss = () => onOpenChange(false);
    window.addEventListener("blur", dismiss, { signal });
    document.addEventListener(
      "focusin",
      (event) => {
        if (event.target instanceof Element && event.target.localName === "wren-view") dismiss();
      },
      { capture: true, signal }
    );
    return () => listeners.abort();
  }, [open, onOpenChange]);
  const enter = () => {
    triangle.cancel();
    contentLeave.cancel();
  };
  return (
    <Radix.Root open={open} onOpenChange={onOpenChange} openDelay={300} closeDelay={CLOSE_DELAY}>
      <Radix.Trigger
        asChild
        onDragStart={close}
        onContextMenu={close}
        // The pointer alone opens and closes it, not the keyboard coming to
        // or going from the trigger (or a control in it), as Radix has it: a
        // card that takes the keyboard, or gives it back to the trigger as
        // it goes, would close or reopen itself.
        onFocus={(event) => event.preventDefault()}
        onBlur={(event) => event.preventDefault()}
        onPointerEnter={enter}
        // Open, it stays as the pointer goes over to it (safe-triangle.tsx).
        onPointerLeave={(event) => {
          if (open && triangle.leave(event)) event.preventDefault();
        }}
      >
        {trigger}
      </Radix.Trigger>
      <Radix.Portal>
        <Radix.Content
          ref={content}
          aria-label={label}
          side={side}
          align={align}
          sideOffset={sideOffset}
          collisionPadding={8}
          data-scheme="system"
          onPointerEnter={enter}
          onPointerLeave={contentLeave.leave}
          // Over the window's title bar too: a press in it is the card's,
          // not a drag of the window. Radix makes what is in the card
          // selectable during a press, inline; it holds controls, no document,
          // so a field in it says `select-text` for itself.
          className={cn("popover no-drag z-50 overflow-hidden outline-none select-none!", className)}
        >
          {children}
        </Radix.Content>
      </Radix.Portal>
      {triangle.overlay}
    </Radix.Root>
  );
}
