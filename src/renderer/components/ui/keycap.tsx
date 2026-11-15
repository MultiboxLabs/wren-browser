// A key that presses the control it is on, after its label: a dialog's
// Escape, a toolbar button's ⌘O. Smaller than the label, on a soft chip, so
// the label still reads first, but in the label's own colour, so it reads.

/** A soft chip with a key's name, as `esc` or `⌘O`, in the text's colour. */
export function Keycap({ children }: { children: string }) {
  return (
    <kbd
      aria-hidden
      className="grid h-4 place-items-center rounded-[4px] bg-current/12 px-1 font-sans text-[10px] leading-none font-semibold tracking-wide uppercase"
    >
      {children}
    </kbd>
  );
}
