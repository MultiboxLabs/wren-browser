// A dialog, as the platform's own: on macOS a sheet, a card that grows into
// the middle of the window, which dims behind it and takes no clicks while
// it is up. It asks something and waits for the answer: Return presses its
// default button, even from a field; Escape (and ⌘. on a Mac) its Cancel
// button (or, with no Cancel button, its default one, which is all it
// answers with); and a click on the window behind it does nothing.

import { CornerDownLeft, LoaderCircle } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Dialog as Radix } from "radix-ui";
import { type KeyboardEvent, type ReactNode, useRef, useState } from "react";
import { Button } from "./button";
import { cn } from "../../utils/cn";

/** The dialog's default button. */
export type DialogAction = {
  label: string;
  /**
   * What it does. The dialog closes once it is done: at once, or when the
   * promise it returns resolves. One that rejects keeps the dialog open,
   * to show why.
   */
  onPress: () => void | Promise<unknown>;
  disabled?: boolean;
};

export type DialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Above the title: what it is about, as an app's icon. */
  icon?: ReactNode;
  /** What it asks, in a line of its own. */
  title: string;
  /** A line or two more on it, below the title. */
  description?: ReactNode;
  action: DialogAction;
  /**
   * The label of the button that closes it, before the default one. None
   * (`null`) leaves it out, for an alert that has nothing to ask: Escape
   * then presses the default button.
   */
  cancel?: string | null;
  /**
   * A button of another answer, apart from the others at the left, as
   * "Always Quit". It closes the dialog once it is pressed, as Cancel does.
   */
  secondary?: { label: string; onPress: () => void };
  /** Its buttons show their keys: Escape on Cancel, Return on the default one. */
  keys?: boolean;
  /** Its width, which is 384 points by default. */
  className?: string;
  /** What it holds between its text and its buttons: a field, a list. */
  children?: ReactNode;
};

export function Dialog(props: DialogProps) {
  return (
    <Radix.Root open={props.open} onOpenChange={props.onOpenChange}>
      {/* The card is made afresh each time it opens, so nothing of the last
          time (a press still waited on) is left in it. */}
      <AnimatePresence>{props.open && <Card key="dialog" {...props} />}</AnimatePresence>
    </Radix.Root>
  );
}

const isMac = () => document.documentElement.dataset.platform === "mac";

// In, a strong ease-out: it moves at once, where the eye is, and settles
// slowly. Out, a gentler one: the strong one would do nearly all its fade in
// the first two frames, and the dialog would seem to vanish rather than go.
// Out is still quicker than in: the answer is given, and the window should
// be back soon.
const IN = { duration: 0.2, ease: [0.23, 1, 0.32, 1] as const };
const OUT = { duration: 0.16, ease: [0, 0, 0.58, 1] as const };

// How long a press may wait before the default button says it is working. A
// quicker answer closes the dialog with no change to it at all, not a flash
// of a disabled button.
const SLOW = 400;

function Card({
  onOpenChange,
  icon,
  title,
  description,
  action,
  cancel = "Cancel",
  secondary,
  keys: showKeys = false,
  className,
  children
}: DialogProps) {
  const still = useReducedMotion();
  // Its scale, as a transform: Motion runs that on the compositor, where
  // its `scale` would run on the main thread, which drops frames while a
  // page loads behind the dialog. Reduced Motion leaves it out, so only the
  // fade is left; Motion does not do that for a transform by itself.
  const grown = (scale: number) => (still ? {} : { transform: `scale(${scale})` });
  const card = useRef<HTMLDivElement>(null);
  // The default button's press, while what it does is not yet done: the
  // dialog waits for it, and takes no other answer. `slow` once it has
  // waited long enough to say so.
  const [pending, setPending] = useState(false);
  const [slow, setSlow] = useState(false);

  const close = () => {
    if (!pending) onOpenChange(false);
  };
  const confirm = () => {
    if (pending || action.disabled) return;
    const done = action.onPress();
    if (!(done instanceof Promise)) return onOpenChange(false);
    setPending(true);
    const timer = setTimeout(() => setSlow(true), SLOW);
    done.then(
      () => {
        clearTimeout(timer);
        onOpenChange(false);
      },
      () => {
        clearTimeout(timer);
        setPending(false);
        setSlow(false);
      }
    );
  };

  const keys = (event: KeyboardEvent) => {
    if (event.key === "Enter" && !event.nativeEvent.isComposing && !(event.target instanceof HTMLTextAreaElement)) {
      // Not a press of the button that has focus, if one has: Return is
      // the default button's, as on the platform.
      event.preventDefault();
      confirm();
    } else if (event.key === "." && event.metaKey && isMac()) {
      event.preventDefault();
      if (cancel === null) confirm();
      else close();
    }
  };

  return (
    <Radix.Portal forceMount>
      <Radix.Overlay asChild forceMount>
        {/* The window can still be moved by it, as by a native window's
            title bar while a dialog is up. */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: IN }}
          exit={{ opacity: 0, transition: OUT }}
          className="dialog-scrim drag fixed inset-0 z-50"
        />
      </Radix.Overlay>
      <div className="pointer-events-none fixed inset-0 z-50 grid place-items-center p-5">
        <Radix.Content
          asChild
          forceMount
          ref={card}
          // Radix ties it to its description; without one, to nothing.
          {...(description === undefined && { "aria-describedby": undefined })}
          // A field takes the keyboard, as in a native dialog; with none, the
          // dialog does, and no button shows a focus ring it was not asked for.
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            const field = card.current?.querySelector<HTMLElement>("input:not(:disabled), textarea:not(:disabled)");
            (field ?? card.current)?.focus();
          }}
          onEscapeKeyDown={(event) => {
            if (pending) return event.preventDefault();
            if (cancel === null) {
              event.preventDefault();
              confirm();
            }
          }}
          onPointerDownOutside={(event) => event.preventDefault()}
          onInteractOutside={(event) => event.preventDefault()}
          onKeyDown={keys}
        >
          {/* It grows from a little smaller, not from nothing, and from its
              middle: it hangs off no control, but the window. */}
          <motion.div
            initial={{ opacity: 0, ...grown(0.96) }}
            animate={{ opacity: 1, ...grown(1), transition: IN }}
            exit={{ opacity: 0, ...grown(0.97), transition: OUT }}
            className={cn(
              "dialog no-drag pointer-events-auto flex w-96 max-w-full flex-col gap-6 px-7 pt-7 pb-6 outline-none",
              className
            )}
          >
            <div className="flex flex-col gap-2.5">
              {icon && <div className="mb-1.5">{icon}</div>}
              <Radix.Title className="text-dialog-title font-semibold">{title}</Radix.Title>
              {description !== undefined && (
                <Radix.Description className="leading-normal text-fg-2">{description}</Radix.Description>
              )}
            </div>
            {children}
            <div className="flex justify-end gap-2.5">
              {secondary && (
                <Button
                  variant="raised"
                  shape="large"
                  disabled={slow}
                  onClick={() => {
                    secondary.onPress();
                    close();
                  }}
                  className="mr-auto"
                >
                  {secondary.label}
                </Button>
              )}
              {cancel !== null && (
                <Button variant="raised" shape="large" disabled={slow} onClick={close}>
                  {cancel}
                  {showKeys && <Key name="escape" />}
                </Button>
              )}
              <Button
                variant="prominent"
                shape="large"
                disabled={action.disabled}
                aria-busy={pending}
                onClick={confirm}
              >
                <Working slow={slow}>
                  {action.label}
                  {showKeys && <Key name="return" />}
                </Working>
              </Button>
            </div>
          </motion.div>
        </Radix.Content>
      </div>
    </Radix.Portal>
  );
}

// The key that presses the button it is on, after its label, faint, so the
// label still reads first: Escape a soft chip with its name, Return its
// arrow alone.
function Key({ name }: { name: "escape" | "return" }) {
  if (name === "return") return <CornerDownLeft size={14} strokeWidth={2.25} aria-hidden className="opacity-60" />;
  return (
    <kbd
      aria-hidden
      className="grid h-4 place-items-center rounded-[4px] bg-current/12 px-1 font-sans text-[9px] leading-none font-bold tracking-wide uppercase opacity-60"
    >
      esc
    </kbd>
  );
}

// The default button's label, or a spinner in its place while what it does
// is slow. The label keeps its room, so the button keeps its width; the two
// cross through a slight blur, which reads as one thing changing rather than
// one laid over the other. The spinner turns only while it shows.
function Working({ slow, children }: { slow: boolean; children: ReactNode }) {
  const swap = "col-start-1 row-start-1 transition-[opacity,filter] duration-150 ease-out";
  return (
    <span className="grid place-items-center">
      <span className={cn(swap, "inline-flex items-center gap-1.5", slow && "opacity-0 blur-[2px]")}>{children}</span>
      <LoaderCircle
        size={15}
        strokeWidth={2}
        aria-hidden
        className={cn(swap, slow ? "animate-spin" : "opacity-0 blur-[2px]")}
      />
    </span>
  );
}
