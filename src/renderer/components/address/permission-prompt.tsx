// A page's request for permissions, in the popover off the page info button
// (page-info.tsx) in place of Chromium's prompt: Chrome's title ("example.com
// wants to"), a row for each permission, and the answers, stacked as the
// system's own permission alerts stack them, and named as theirs are. Its
// close button closes it with no answer. It is drawn as page info is,
// its rows as page info's permission rows, so the two read as one.

import { type PermissionAnswer, permission, type PermissionPrompt } from "@/ipc";
import { CloseIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { permissionIcon } from "./permission-icons";

export function PermissionPromptContent({ prompt }: { prompt: PermissionPrompt }) {
  // An Allow too soon after the prompt opened is refused, as Chrome ignores
  // such a click, and the prompt stays for another.
  const answer = (chosen: PermissionAnswer) => permission.answer(prompt.id, chosen).catch(() => {});
  return (
    <div className="flex w-66 flex-col p-2.5">
      <div className="flex items-start justify-between gap-2">
        <h2 className="px-0.5 pt-1 font-semibold">{prompt.title}</h2>
        <Button icon={CloseIcon} iconSize={18} label="Close" onClick={() => answer("dismiss")} />
      </div>
      <ul className="mt-2 flex flex-col gap-1">
        {prompt.permissions.map((requested) => {
          const Icon = permissionIcon(requested.id);
          return (
            <li key={requested.id} className="flex min-h-10 items-center gap-2.5 p-1.5">
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-fill">
                <span className="grid glyph-1">
                  <Icon size={14} strokeWidth={2} />
                </span>
              </span>
              <span className="min-w-0">{requested.label}</span>
            </li>
          );
        })}
      </ul>
      <div className="mt-2.5 flex flex-col gap-1.5">
        <Button variant="prominent" className="w-full" onClick={() => answer("allow")}>
          Allow
        </Button>
        {prompt.canAllowOnce && (
          <Button variant="raised" className="w-full" onClick={() => answer("allow-once")}>
            Allow Once
          </Button>
        )}
        <Button variant="raised" className="w-full" onClick={() => answer("block")}>
          Don’t Allow
        </Button>
      </div>
    </div>
  );
}
