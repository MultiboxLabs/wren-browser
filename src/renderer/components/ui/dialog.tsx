// A dialog, as the platform's own: on macOS a sheet, a card that grows into
// the middle of the window, which dims behind it and takes no clicks while
// it is up. It asks something and waits for the answer: Return presses its
// default button, even from a field; Escape (and ⌘. on a Mac) its Cancel
// button; and a click on the window behind it does nothing.

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Dialog as Radix } from "radix-ui";
import { type KeyboardEvent, type ReactNode, useRef, useState } from "react";
import { Button } from "./button";
import { cn } from "../../utils/cn";
import { scaleTo } from "../../utils/motion";

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
  /** What it asks, in a line of its own. */
  title: string;
  /** A line or two more on it, below the title. */
  description?: ReactNode;
  action: DialogAction;
  /** The label of the button that closes it, before the default one. */
  cancel?: string;
  /** Its width, which is 400 points by default. */
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

function Card({ onOpenChange, title, description, action, cancel = "Cancel", className, children }: DialogProps) {
  const still = useReducedMotion();
  const card = useRef<HTMLDivElement>(null);
  // The default button's press, while what it does is not yet done: the
  // dialog waits for it, and takes no other answer.
  const [pending, setPending] = useState(false);

  const close = () => {
    if (!pending) onOpenChange(false);
  };
  const confirm = () => {
    if (pending || action.disabled) return;
    const done = action.onPress();
    if (!(done instanceof Promise)) return onOpenChange(false);
    setPending(true);
    done.then(
      () => onOpenChange(false),
      () => setPending(false)
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
      close();
    }
  };

  return (
    <Radix.Portal forceMount>
      <Radix.Overlay asChild forceMount>
        {/* The window can still be moved by it, as by a native window's
            title bar while a dialog is up. */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
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
          onEscapeKeyDown={(event) => pending && event.preventDefault()}
          onPointerDownOutside={(event) => event.preventDefault()}
          onInteractOutside={(event) => event.preventDefault()}
          onKeyDown={keys}
        >
          <motion.div
            initial={{ opacity: 0, ...scaleTo(still, 0.9) }}
            animate={{ opacity: 1, ...scaleTo(still, 1) }}
            exit={{ opacity: 0, ...scaleTo(still, 0.95), transition: { duration: 0.15, ease: "easeIn" } }}
            transition={{
              scale: { type: "spring", duration: 0.35, bounce: 0.2 },
              opacity: { duration: 0.15, ease: "easeOut" }
            }}
            className={cn(
              "dialog no-drag pointer-events-auto flex w-100 max-w-full flex-col gap-4 p-5 outline-none",
              className
            )}
          >
            <div className="flex flex-col gap-1.5">
              <Radix.Title className="text-menu-item font-semibold">{title}</Radix.Title>
              {description !== undefined && (
                <Radix.Description className="text-subtitle leading-snug text-fg-2">{description}</Radix.Description>
              )}
            </div>
            {children}
            <div className="flex justify-end gap-2">
              <Button variant="raised" disabled={pending} onClick={close} className="min-w-19">
                {cancel}
              </Button>
              <Button variant="prominent" disabled={pending || action.disabled} onClick={confirm} className="min-w-19">
                {action.label}
              </Button>
            </div>
          </motion.div>
        </Radix.Content>
      </div>
    </Radix.Portal>
  );
}
