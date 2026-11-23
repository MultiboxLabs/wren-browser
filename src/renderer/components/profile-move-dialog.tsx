// Asks before a move makes tabs again in another profile, where they open
// without their history (ipc/profile_move.rs): a drop of tabs of the list,
// or a Mini Wren's page opened as a tab. The move waits for the answer. The
// space they go to, on a tile of its colour badged with an arrow, says
// where. Move, the default, moves them; Cancel, on Escape, leaves them.
// "Don't ask again" turns the question off once Move is pressed, as
// Settings' Ask Before Moving Tabs does.

import { useEffect, useRef, useState } from "react";
import { SpaceIcon } from "./space-icon";
import { TileBadge, TileIcon, toneOf } from "./tile-icon";
import { Checkbox } from "./ui/checkbox";
import { Dialog } from "./ui/dialog";
import { hasApp, type MoveQuestion, profileMove, settings } from "@/ipc";
import { type Space, spaceOf, useSpace } from "@/state/space";

export function ProfileMoveDialog() {
  const { space: shown, spaces } = useSpace();
  // The last question stays as the dialog goes, so its text does not change
  // as it fades.
  const [question, setQuestion] = useState<MoveQuestion | null>(null);
  const [open, setOpen] = useState(false);
  const [dontAsk, setDontAsk] = useState(false);
  // It closes after Move too: only a close without it is a Cancel.
  const answered = useRef(false);
  useEffect(() => {
    if (!hasApp) return;
    return profileMove.onAsk((asked) => {
      setQuestion(asked);
      setDontAsk(false);
      setOpen(true);
    });
  }, []);

  const entry = spaces.find(({ id }) => id === question?.space);
  // With no space, they go to the window's own profile, which it shows: a
  // Mini Wren's page goes to no space only in its own profile, which never
  // asks.
  const to = entry ? spaceOf(entry) : shown;
  const move = () => {
    answered.current = true;
    if (dontAsk) settings.update({ askBeforeProfileMove: false }).catch(() => {});
    profileMove.answer(true).catch(() => {});
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) return;
        if (!answered.current) profileMove.answer(false).catch(() => {});
        answered.current = false;
        setOpen(false);
      }}
      icon={<Destination space={to} />}
      title={question ? titleOf(question, to.name) : ""}
      description={question ? descriptionOf(question, to.name) : undefined}
      action={{ label: "Move", onPress: move }}
      aside={
        <Checkbox checked={dontAsk} onCheckedChange={setDontAsk}>
          Don’t ask again
        </Checkbox>
      }
      keys
      className="w-108"
    />
  );
}

/** The title, by what goes: a tab, a group or several tabs, as Move 3 Tabs to "Work"? */
function titleOf({ what, tabs }: MoveQuestion, name: string) {
  const moved = what === "tab" ? "Tab" : what === "group" ? "Group" : `${tabs} Tabs`;
  return `Move ${moved} to “${name}”?`;
}

/** What the user loses of the tabs that go, which is the reason to ask. */
function descriptionOf({ what }: MoveQuestion, name: string) {
  const lost =
    what === "tab"
      ? "The tab opens again there, without its history or anything you’ve typed in it"
      : what === "group"
        ? "The group’s tabs open again there, without their history or anything you’ve typed in them"
        : "The tabs open again there, without their history or anything you’ve typed in them";
  return `“${name}” uses another profile. ${lost}, and you may need to sign in again.`;
}

// The space the tabs go to: its icon in white on a tile of its colour, with
// a badge of an arrow at its corner, as they move there. One arrow: two, as
// a swap, crowd a badge this small.
function Destination({ space }: { space: Space }) {
  const size = 44;
  return (
    <span className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      <span className="absolute inset-0">
        <TileIcon tone={toneOf(space.color)} size={size} />
      </span>
      <span className="relative text-white">
        <SpaceIcon icon={space.icon} size={24} strokeWidth={2} />
      </span>
      <span className="absolute -right-1.5 -bottom-1.5">
        <TileBadge tone="slate">
          <path d="M5 9h7.5M9.5 5.75 12.75 9 9.5 12.25" strokeWidth={1.5} />
        </TileBadge>
      </span>
    </span>
  );
}
