// The window's toast, at its top right: Chromium's ("Link
// copied") and the app's own (⇧⌘C's) alike, which the app answers in place
// of Chromium's. Chromium decides when each goes. The zoom level's ("110%")
// is bare: text alone.

import { Glasses, Image, Link, LoaderCircle } from "lucide-react";
import type { ReactNode } from "react";
import type { Icon } from "./ui/button";
import { Toast as ToastView } from "./ui/toast";
import { iconUrl, type Toast, toast as toasts } from "../ipc";
import { useToastShown } from "../state/browser";

// Our own icons, by the toast's name. Any other has Chromium's.
const icons: Record<string, Icon> = {
  UrlCopied: Link,
  LinkCopied: Link,
  LinkToHighlightCopied: Link,
  ImageCopied: Image,
  AddedToReadingList: Glasses
};

export function BrowserToast() {
  const toast = useToastShown();
  return (
    <ToastView
      // The page's top right, in from its corner as from the window's.
      className="fixed top-4.5 right-4.5 z-30"
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
