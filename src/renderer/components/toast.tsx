// The window's toast, at its top right, below the address bar atop the
// page if one is there (address/page-bar.tsx): Chromium's ("Link
// copied") and the app's own (⇧⌘C's) alike, which the app answers in place
// of Chromium's. Chromium decides when each goes. The zoom level's ("110%")
// is bare: text alone.

import { CircleAlert, CircleCheck, Glasses, Image, Link, LoaderCircle } from "lucide-react";
import type { ReactNode } from "react";
import type { Icon } from "./ui/button";
import { Toast as ToastView } from "./ui/toast";
import { iconUrl, type Toast, toast as toasts } from "@/ipc";
import { useToastShown } from "@/state/browser";
import { cn } from "@/utils/cn";

// Our own icons, by the toast's name. Any other has Chromium's.
const icons: Record<string, Icon> = {
  UrlCopied: Link,
  LinkCopied: Link,
  LinkToHighlightCopied: Link,
  ImageCopied: Image,
  AddedToReadingList: Glasses,
  UpToDate: CircleCheck,
  UpdateCheckFailed: CircleAlert
};

/** `belowBar`: the page at the window's top right has its address bar atop it, which the toast would cover. */
export function BrowserToast({ belowBar = false }: { belowBar?: boolean }) {
  const toast = useToastShown();
  return (
    <ToastView
      // The page's top right, in from its corner as from the window's; below
      // the bar (h-9), as far in from it.
      className={cn("fixed right-4.5 z-30", belowBar ? "top-13.5" : "top-4.5")}
      toast={
        toast && {
          // Each request comes in afresh, the same toast shown again too.
          key: toast.id,
          text: toast.text,
          icon: toastIcon(toast),
          action: toast.button ? { label: toast.button, onPress: () => toasts.press(toast.id) } : undefined,
          onClose: () => toasts.close(toast.id)
        }
      }
    />
  );
}

// The app's toasts that show their text alone.
const bare = new Set(["Zoom"]);

function toastIcon(toast: Toast): ReactNode {
  if (bare.has(toast.name)) return null;
  if (toast.busy) return <LoaderCircle size={15} strokeWidth={2} className="animate-spin" />;
  const Own = icons[toast.name];
  if (Own) return <Own size={15} strokeWidth={2} />;
  if (!toast.icon) return null;
  // Chromium's, drawn in its own colour for the window's appearance, which
  // may not be the toast's: its shape in the toast's text colour instead.
  return (
    <span
      style={{ maskImage: `url(${iconUrl(toast.icon)})`, maskSize: "contain", maskRepeat: "no-repeat" }}
      className="size-4 bg-current"
    />
  );
}
