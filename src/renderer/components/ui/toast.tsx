// A toast: a word that something was done ("Copied Current
// URL"), with an icon on a tile at its end. It grows down out of the middle
// of its top edge, and shrinks back into it as it goes; another in its place
// comes in once the one before has gone so. A click closes it, and none
// reach what is under it.

import { AnimatePresence, motion } from "motion/react";
import type { Key, ReactNode } from "react";
import { press } from "./press";
import { cn } from "../../utils/cn";

/** What a toast shows. Another `key` replaces it, and comes in afresh. */
export type ToastContent = {
  key: Key;
  text: string;
  icon?: ReactNode;
  action?: { label: string; onPress: () => void };
  /** A click on it, not its button. */
  onClose?: () => void;
};

/** Shows `toast` until it is null or another; `className` places it. */
export function Toast({ toast, className }: { toast: ToastContent | null; className?: string }) {
  const action = toast?.action;
  return (
    <AnimatePresence mode="wait">
      {toast && (
        <motion.div
          key={toast.key}
          role="status"
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8, transition: { duration: 0.12, ease: "easeIn" } }}
          transition={{
            scale: { type: "spring", duration: 0.35, bounce: 0.3 },
            opacity: { duration: 0.1, ease: "easeOut" }
          }}
          style={{ transformOrigin: "top center" }}
          onClick={toast.onClose}
          className={cn("toast no-drag flex h-10 items-center gap-2 pr-2 pl-3.5 font-semibold", className)}
        >
          <span className="mr-1 whitespace-nowrap">{toast.text}</span>
          {action && (
            <motion.button
              {...press(0.95)}
              onClick={(event) => {
                // Not a click on the toast as well: what it does closes the
                // toast by itself, and a close first would undo it.
                event.stopPropagation();
                action.onPress();
              }}
              className="toast-tile h-6.5 px-2.5 whitespace-nowrap"
            >
              {action.label}
            </motion.button>
          )}
          {toast.icon && <span className="toast-tile grid h-6.5 w-7.5 shrink-0 place-items-center">{toast.icon}</span>}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
