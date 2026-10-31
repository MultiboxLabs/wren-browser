// A download's row: its thumbnail, or its progress while it runs; its name;
// and a line under it, which the list it is in says. A click opens
// a file that is done, and a right-click shows its menu. Its buttons are
// what may be done to it now: cancel while it runs, resume once paused,
// retry once failed, and keep or discard a file Chrome warns of.

import { Check, File, Play, RotateCw, Trash2, X } from "lucide-react";
import { motion } from "motion/react";
import { type Download, type DownloadAction, downloads } from "@/ipc";
import { Button, type Icon } from "@/components/ui/button";
import { press } from "@/components/ui/press";
import { isRunning, useDownloadThumbnail } from "@/state/downloads";
import { cn } from "@/utils/cn";
import { ProgressRing } from "./progress-ring";

export function DownloadRow({
  download,
  line,
  selected = false,
  onMenu
}: {
  download: Download;
  /** The line under its name: its status, or else what the list says of it. */
  line: string;
  /** Chosen, as the one the Library was opened at. */
  selected?: boolean;
  /** Its menu opened; the promise settles as it closes. */
  onMenu?: (closed: Promise<unknown>) => void;
}) {
  const can = (action: DownloadAction) => download.actions.includes(action);
  const perform = (action: DownloadAction) => void downloads.perform(download.id, action).catch(() => {});
  // Over, with no file to open.
  const gone = download.status === "cancelled" || download.status === "failed" || download.fileRemoved;
  return (
    <motion.div
      {...press(0.985)}
      role="button"
      tabIndex={-1}
      onClick={() => can("open") && perform("open")}
      onContextMenu={(event) => {
        event.preventDefault();
        const closed = downloads.menu(download.id, event.clientX, event.clientY).catch(() => null);
        onMenu?.(closed);
      }}
      data-download={download.id}
      className={cn(
        "no-drag group flex h-13 shrink-0 items-center gap-3 rounded-row pr-1.5 pl-1.5",
        selected ? "bg-selected" : "hover:bg-hover"
      )}
    >
      <Thumbnail download={download} />
      <span className={cn("flex min-w-0 flex-1 flex-col gap-0.5", gone && "opacity-70")}>
        <span className="truncate">{download.name}</span>
        <span
          className={cn(
            "truncate text-subtitle tabular-nums",
            download.warning === "dangerous" ? "text-danger" : "text-fg-2"
          )}
        >
          {line}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-0.5">
        {can("keep") && <RowButton icon={Check} label="Keep" onPress={() => perform("keep")} />}
        {can("discard") && <RowButton icon={Trash2} label="Discard" onPress={() => perform("discard")} />}
        {can("resume") && <RowButton icon={Play} label="Resume" onPress={() => perform("resume")} />}
        {can("retry") && <RowButton icon={RotateCw} label="Try Again" onPress={() => perform("retry")} />}
        {can("cancel") && <RowButton icon={X} label="Cancel" onPress={() => perform("cancel")} />}
      </span>
    </motion.div>
  );
}

// What stands for the file: its progress while it runs, or else its
// thumbnail, or its type's icon.
function Thumbnail({ download }: { download: Download }) {
  const url = useDownloadThumbnail(download);
  const known = download.total > 0 ? download.received / download.total : null;
  return (
    <span className="grid size-10 shrink-0 place-items-center">
      {isRunning(download) ? (
        // Paused, it stands still, though its size is not known.
        <ProgressRing fraction={known ?? (download.paused ? 0 : null)} size={28} />
      ) : url ? (
        <img src={url} alt="" draggable={false} className="max-h-10 max-w-10 object-contain" />
      ) : (
        url === null && <File size={26} strokeWidth={1.5} className="glyph-2" />
      )}
    </span>
  );
}

function RowButton({ icon, label, onPress }: { icon: Icon; label: string; onPress: () => void }) {
  return (
    <Button
      icon={icon}
      iconSize={14}
      label={label}
      // The row's own press and click are not this one's.
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        onPress();
      }}
      className="size-6"
    />
  );
}
