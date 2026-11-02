// The source's extensions from the Chrome Web Store, to choose which come
// over. Chromium installs them without asking, so the page asks here.

import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog } from "@/components/ui/dialog";
import type { StoreExtension } from "@/ipc";
import { SourceIcon } from "./source-icon";

export function ExtensionsDialog({
  open,
  onOpenChange,
  extensions,
  chosen,
  onChoose
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  extensions: StoreExtension[];
  chosen: Set<string>;
  onChoose: (chosen: Set<string>) => void;
}) {
  // What is ticked here, kept only once Done is pressed.
  const [ticked, setTicked] = useState(chosen);
  if (!open && ticked !== chosen) setTicked(chosen);
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Choose Extensions"
      description="Each is installed from the Chrome Web Store, with the permissions it asks for."
      action={{ label: "Done", onPress: () => onChoose(ticked) }}
    >
      <div className="flex max-h-72 flex-col gap-2 overflow-y-auto py-1">
        {extensions.map((extension) => (
          <Checkbox
            key={extension.id}
            checked={ticked.has(extension.id)}
            onCheckedChange={(on) =>
              setTicked((all) => {
                const next = new Set(all);
                if (on) next.add(extension.id);
                else next.delete(extension.id);
                return next;
              })
            }
          >
            <span className="flex items-center gap-2">
              <SourceIcon source={extension} size={18} />
              {extension.name}
            </span>
          </Checkbox>
        ))}
      </div>
    </Dialog>
  );
}
