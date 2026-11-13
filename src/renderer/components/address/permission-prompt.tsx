// A page's request for permissions, in the popover off the page info button
// (page-info.tsx) in place of Chromium's prompt: Chrome's title ("example.com
// wants to"), a row for each permission, and the answers, stacked as the
// system's own permission alerts stack them, and named as theirs are. Its
// close button closes it with no answer. Its rows have the circles of page
// info's permission rows, so the two read as one.
//
// Everything in it starts on one edge, 12 points in: the title, the rows'
// circles and the buttons, and the close button ends on the same edge at the
// right. At that padding the buttons' corners nest in the popover's.

import { X } from "lucide-react";
import { type PermissionAnswer, permission, type PermissionPrompt } from "@/ipc";
import { Button } from "@/components/ui/button";
import { permissionIcon } from "./permission-icons";

export function PermissionPromptContent({ prompt }: { prompt: PermissionPrompt }) {
  // An Allow too soon after the prompt opened is refused, as Chrome ignores
  // such a click, and the prompt stays for another.
  const answer = (chosen: PermissionAnswer) => permission.answer(prompt.id, chosen).catch(() => {});
  return (
    <div className="flex w-66 flex-col p-3">
      {/* The title's line is as tall as the close button, so the two share a
          middle, and a title that wraps leaves the button at the top. */}
      <div className="flex items-start justify-between gap-2.5">
        <h2 className="min-w-0 leading-5 font-semibold wrap-anywhere">{prompt.title}</h2>
        {/* A small filled circle, as the system's close buttons are: its fill
            shows where it ends, which a bare glyph would not. */}
        <Button
          variant="faint"
          icon={<X size={11} strokeWidth={2.75} />}
          iconTone="dim"
          label="Close"
          className="size-5 rounded-full"
          onClick={() => answer("dismiss")}
        />
      </div>
      <ul className="mt-2.5 flex flex-col gap-1.5">
        {prompt.permissions.map((requested) => {
          const Icon = permissionIcon(requested.id);
          return (
            <li key={requested.id} className="flex items-center gap-2.5">
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
      <div className="mt-3.5 flex flex-col gap-1.5">
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
