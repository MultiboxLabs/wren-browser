// What a tab's row says its page is doing, beside its favicon: one slot, for
// the most exposing of what applies. Sharing the screen, the page being
// captured, the camera and the microphone are marks in a colour of their own
// (tab-alert.css), and name all that applies as they are hovered. Sound, the last,
// is a speaker that mutes or unmutes the tab; its menu does that too, for a
// tab whose sound another alert hides here.

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { CameraIcon, CaptureIcon, MicrophoneIcon, ScreenShareIcon, SoundIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { browser } from "@/ipc";
import type { Tab } from "@/state/space";
import { cn } from "@/utils/cn";
import { scaleTo } from "@/utils/motion";
import { CONTROL_IN, CONTROL_OUT, TILE_IN, TILE_OUT } from "./row-motion";
import { ROW_CONTENT_GAP, ROW_END_MARK } from "./rows";

/** The marks, most exposing first. A camera's mark is read as the microphone too; a microphone's is not read as the camera. */
const MARKS = [
  { on: (tab: Tab) => tab.capturingScreen, key: "screen", Icon: ScreenShareIcon, color: "text-alert-screen" },
  { on: (tab: Tab) => tab.beingCaptured, key: "captured", Icon: CaptureIcon, color: "text-alert-captured" },
  { on: (tab: Tab) => tab.camera, key: "camera", Icon: CameraIcon, color: "text-alert-camera" },
  { on: (tab: Tab) => tab.microphone, key: "microphone", Icon: MicrophoneIcon, color: "text-alert-microphone" }
];

/** All that a tab's marks stand for, in their order. */
function markLabel(tab: Tab) {
  const devices = [tab.camera && "camera", tab.microphone && "microphone"].filter(Boolean).join(" and ");
  return [
    tab.capturingScreen && "Sharing your screen",
    tab.beingCaptured && "Tab is being captured",
    devices && `Using your ${devices}`
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * A tab's slot. It takes room as an alert comes, the title sliding over, and
 * gives it back as the last goes; a row drawn with one already has it. One
 * alert fades into the next in place. Between the favicon and title, it
 * reaches into their gaps. After the title (`trailing`), it takes its full
 * width to keep the button inside the row.
 */
export function TabAlert({ tab, trailing = false }: { tab?: Tab; trailing?: boolean }) {
  const still = useReducedMotion();
  const mark = tab && MARKS.find(({ on }) => on(tab));
  const closed = still ? { opacity: 0 } : { width: 0, marginRight: -ROW_CONTENT_GAP, opacity: 0 };
  const open = still ? { opacity: 1 } : { width: trailing ? 22 : 8, marginRight: 0, opacity: 1 };
  return (
    <AnimatePresence initial={false}>
      {tab && (mark || tab.audible) && (
        <motion.span
          key="slot"
          initial={closed}
          animate={{ ...open, transition: CONTROL_IN }}
          exit={{ ...closed, transition: CONTROL_OUT }}
          {...(trailing ? ROW_END_MARK : {})}
          className={cn("flex shrink-0", trailing ? "w-5.5" : "w-2")}
        >
          <span className={cn("grid size-5.5 shrink-0 *:[grid-area:1/1]", !trailing && "-mx-1.75")}>
            <AnimatePresence initial={false}>
              <motion.span
                key={mark?.key ?? "sound"}
                initial={{ opacity: 0, ...scaleTo(still, 0.8) }}
                animate={{ opacity: 1, ...scaleTo(still, 1), transition: TILE_IN }}
                exit={{ opacity: 0, ...scaleTo(still, 0.8), transition: TILE_OUT }}
                className="grid"
              >
                {mark ? (
                  <Tooltip label={markLabel(tab)}>
                    <span className={`grid place-items-center ${mark.color}`}>
                      <mark.Icon />
                    </span>
                  </Tooltip>
                ) : (
                  <Button
                    icon={<SoundIcon muted={!!tab.muted} />}
                    shape="none"
                    label={tab.muted ? "Unmute Tab" : "Mute Tab"}
                    scale={0.9}
                    // Pressed alone, without the row around it.
                    propagate={{ tap: false }}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={() => void browser.setMuted(tab.id, !tab.muted)}
                    className="grid size-5.5 place-items-center rounded-control"
                  />
                )}
              </motion.span>
            </AnimatePresence>
          </span>
        </motion.span>
      )}
    </AnimatePresence>
  );
}
