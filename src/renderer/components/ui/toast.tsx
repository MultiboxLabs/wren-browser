// A toast: a word that something was done ("Copied current URL"), with an icon
// before it, drawn bare in the text's colour, and a
// button after it if it has one. It grows down out of the middle
// of its top edge, from small enough and past its size far enough that it
// is seen arriving by someone looking elsewhere, and shrinks back into its
// top edge as it goes. Another in its place comes in once it has gone. The
// same toast asked for again stays and jumps. A click closes it, and none
// reach what is under it.

import { AnimatePresence, motion, useAnimate, useReducedMotion } from "motion/react";
import { type Key, type ReactNode, useEffect, useRef } from "react";
import { press } from "./press";
import { cn } from "@/utils/cn";
import { EASE_LEAVE, scaleTo } from "@/utils/motion";

/** What a toast shows. Another `key` replaces it, and comes in afresh. */
export type ToastContent = {
  key: Key;
  /** Which asking for it this is. Another under the same `key` keeps the toast where it is, and it jumps. */
  request?: Key;
  text: string;
  icon?: ReactNode;
  action?: { label: string; onPress: () => void };
  /** A click on it, not its button. */
  onClose?: () => void;
};

const ARRIVE = { type: "spring", duration: 0.35, bounce: 0.3 } as const;
const JUMP = { type: "spring", duration: 0.35, bounce: 0.4 } as const;

/** Shows `toast` until it is null or another; `className` places it. */
export function Toast({ toast, className }: { toast: ToastContent | null; className?: string }) {
  return (
    <AnimatePresence mode="wait">
      {toast && <Shown key={toast.key} toast={toast} className={className} />}
    </AnimatePresence>
  );
}

function Shown({ toast, className }: { toast: ToastContent; className?: string }) {
  const action = toast.action;
  const still = useReducedMotion();
  const [scope, animate] = useAnimate<HTMLDivElement>();

  // Asked for again while it shows: it is already where the eye would look
  // for it, so it jumps in place. With Reduced Motion it blinks.
  const request = useRef(toast.request);
  useEffect(() => {
    if (request.current === toast.request) return;
    request.current = toast.request;
    if (still) animate(scope.current, { opacity: [0.5, 1] }, { duration: 0.2, ease: "easeOut" });
    else animate(scope.current, { scale: [1.08, 1] }, JUMP);
  }, [toast.request, still, animate, scope]);

  return (
    <motion.div
      ref={scope}
      role="status"
      initial={{ opacity: 0, ...scaleTo(still, 0.6) }}
      animate={{ opacity: 1, ...scaleTo(still, 1) }}
      exit={{
        opacity: 0,
        ...scaleTo(still, 0.8),
        transition: { duration: 0.12, ease: EASE_LEAVE }
      }}
      transition={{ scale: ARRIVE, opacity: { duration: 0.1, ease: "easeOut" } }}
      style={{ transformOrigin: "top center" }}
      onClick={toast.onClose}
      className={cn(
        "toast no-drag flex h-10 items-center gap-1.5 font-semibold",
        // An icon and a button each sit nearer the edge than text does.
        toast.icon ? "pl-3" : "pl-3.5",
        action ? "pr-2" : "pr-3.5",
        className
      )}
    >
      {toast.icon && <span className="grid shrink-0 place-items-center">{toast.icon}</span>}
      <span className={cn("whitespace-nowrap", action && "mr-1")}>{toast.text}</span>
      {action && (
        <motion.button
          {...press(0.95)}
          onClick={(event) => {
            // Not a click on the toast as well: what it does closes the
            // toast by itself, and a close first would undo it.
            event.stopPropagation();
            action.onPress();
          }}
          className="toast-button h-6.5 px-2.5 whitespace-nowrap"
        >
          {action.label}
        </motion.button>
      )}
    </motion.div>
  );
}
