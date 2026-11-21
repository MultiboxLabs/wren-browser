// What a peek has beside its page (src/main/peeks/): a clear layer over the
// tabs behind it, which closes it when clicked, and its three buttons, in a
// column to the right of its card, which close it, make it a tab of the
// list, or set it down in a split beside the page behind it. tab-view.tsx
// lays out the peek's page as a card inset in the box of the tab behind it
// (`PEEK_FRAME`), and darkens the tabs behind. motion.ts moves it all as
// the peek comes and goes, drawing the card in a canvas on its way.

import { Columns2, Maximize2, X } from "lucide-react";
import {
  type CSSProperties,
  type RefObject,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState
} from "react";
import { closePeek, enterPeek, expandPeek, type PeekParts, stop } from "./motion";
import { Button, type Icon } from "@/components/ui/button";
import { hasApp, type Peek, peeks, previewUrl } from "@/ipc";
import { useTab } from "@/state/browser";
import { cn } from "@/utils/cn";

// How far in the card sits from the box of the tab behind it: a share of
// the box's width at each side, which leaves room for the buttons at its
// right, and a little of its height at the top and bottom, never under 10
// points. In whole points, as a page placed at a fraction blurs its text.
const SIDE = "round(nearest, 9%, 1px)";
const END = "round(nearest, max(10px, 1.2%), 1px)";

/** Where a peek's card sits in the box of the tab behind it. */
export const PEEK_FRAME: CSSProperties = { top: END, right: SIDE, bottom: END, left: SIDE };
// The buttons' column: beside the card's right edge, a little below its top.
const BUTTONS: CSSProperties = { top: `calc(${END} + 8px)`, left: `calc(100% - ${SIDE} + 14px)` };

// The longest a closing peek waits for a picture of its page, before it
// goes drawn by its colour alone.
const PICTURE_WAIT = 150;
// How long a peek that has gone is still waited on to close, after the app
// answered and the animation ended, before it is taken to have been kept
// open, as a "Leave site?" can. The app answers once it has asked Chromium
// to close the tab, which tells the page it has gone only later, the later
// the busier the Mac.
const KEPT_AFTER = 1000;

/** How a peek is leaving, as it moves before the app is asked. */
type Leaving = "close" | "expand";

// The peeks this page has brought in. One shown again, as its tab is
// selected again, is there at once, as a tab switched to is.
const entered = new Set<number>();

/**
 * The clear layer over the tabs behind `peek`, under the peek's card, and
 * the peek's buttons, beside it. `card` is the card's element, the peek's
 * slot in tab-view.tsx, and `canvas` what it is drawn in on its way, which
 * tab-view.tsx keeps once the peek has gone, so it draws the peek going
 * after it has closed. Split is left out while the tab behind is in a split
 * already (`canSplit`), as a split has no third side.
 */
export function PeekCover({
  peek,
  canSplit,
  join,
  card,
  canvas
}: {
  peek: Peek;
  canSplit: boolean;
  /** The edges of the box that meet another card, whose corners on the tab the peek becomes as it expands are square (card.css). */
  join?: string;
  card: RefObject<HTMLDivElement | null>;
  canvas: RefObject<HTMLCanvasElement | null>;
}) {
  const buttons = useRef<HTMLDivElement>(null);
  // It is still shown, for what answers after it may have gone.
  const shown = useRef(true);
  const [leaving, setLeaving] = useState<Leaving | null>(null);
  // Whether it comes in now, decided once: React may run the effect below
  // twice as it mounts, stopping the first entrance between, and the second
  // must play it again.
  const [entering] = useState(() => !entered.has(peek.tab));
  // Its card has landed, and its page shows.
  const landed = useRef(!entering);
  // A picture of the page, taken as the pointer leaves it for the layer
  // behind or the buttons, which it must to close or expand the peek, so it
  // is mostly ready by the click. Not before the card has landed: the
  // pointer is often over the layer already as the peek comes, before its
  // page has drawn. One taken before the page last loaded or moved is no
  // longer it.
  const picture = useRef<Promise<HTMLImageElement | null> | null>(null);
  const takePicture = () => {
    if (!leaving && landed.current) picture.current = pictureOf(peek.tab);
  };
  const tab = useTab(peek.tab);
  useEffect(() => {
    picture.current = null;
  }, [tab?.url, tab?.loading]);

  // The parts that move, once they are all drawn.
  const parts = (): PeekParts | null => {
    if (!card.current || !canvas.current || !buttons.current) return null;
    return { card: card.current, canvas: canvas.current, buttons: [...buttons.current.children] as HTMLElement[] };
  };

  useLayoutEffect(() => {
    const drawn = parts();
    shown.current = true;
    entered.add(peek.tab);
    if (drawn && entering) {
      void enterPeek(drawn, peek.from).then(() => {
        landed.current = true;
      });
    }
    // Whatever is still moving, or held, such as the frame of a card that
    // grew to fill the box, ends once the peek is no longer shown; but not
    // the card going back, which the canvas goes on drawing.
    return () => {
      shown.current = false;
      if (drawn) stop(drawn, { keepClosing: true });
    };
  }, []);

  // Once it has a picture of its page to go by, it closes as it starts to
  // go, so the tab behind takes input at once. A page that keeps it open, as
  // a "Leave site?" can, shows it again, once it is plain the tab hasn't
  // closed (`KEPT_AFTER`).
  const close = () => {
    const drawn = parts();
    if (leaving || !drawn) return;
    setLeaving("close");
    void within(picture.current ?? pictureOf(peek.tab), PICTURE_WAIT).then(async (image) => {
      const going = closePeek(drawn, peek.from, image);
      await peeks.close(peek.tab).catch(() => {});
      await going;
      await new Promise((resolve) => setTimeout(resolve, KEPT_AFTER));
      if (!shown.current) return;
      stop(drawn);
      setLeaving(null);
    });
  };
  // It grows to fill the box, and then the app makes it a tab of the list.
  // Only a picture ready already covers it: one taken now would keep it
  // waiting.
  const expand = () => {
    const drawn = parts();
    if (leaving || !drawn) return;
    setLeaving("expand");
    const ready = picture.current ? within(picture.current, 0) : Promise.resolve(null);
    void ready
      .then((image) => expandPeek(drawn, image, join))
      .then(() => peeks.expand(peek.tab))
      .catch(() => {});
  };
  // The main menu's Open as Tab expands it as its button does.
  const expandAsked = useEffectEvent((tab: number) => {
    if (tab === peek.tab) expand();
  });
  useEffect(() => (hasApp ? peeks.onExpandAsked(expandAsked) : undefined), []);
  const split = () => {
    if (!leaving) void peeks.split(peek.tab).catch(() => {});
  };

  const actions: { icon: Icon; label: string; onClick: () => void }[] = [
    { icon: X, label: "Close", onClick: close },
    { icon: Maximize2, label: "Open as Tab", onClick: expand },
    ...(canSplit ? [{ icon: Columns2, label: "Open in Split View", onClick: split }] : [])
  ];

  return (
    <>
      <div aria-hidden className="no-drag absolute inset-0 z-1" onPointerEnter={takePicture} onClick={close} />
      <div
        ref={buttons}
        style={BUTTONS}
        onPointerEnter={takePicture}
        className={cn("no-drag absolute z-3 flex flex-col gap-2", leaving && "pointer-events-none")}
      >
        {actions.map((action) => (
          <span key={action.label} className="grid">
            <Button
              variant="overlay"
              icon={action.icon}
              iconSize={16}
              label={action.label}
              tooltipSide="right"
              onClick={action.onClick}
              className="size-9 rounded-full"
            />
          </span>
        ))}
      </div>
    </>
  );
}

/** A picture of peek `tab`'s page as it is, ready to draw, or null for none. */
async function pictureOf(tab: number): Promise<HTMLImageElement | null> {
  const id = await peeks.picture(tab).catch(() => null);
  if (!id) return null;
  const image = new Image();
  image.src = previewUrl(id);
  return image.decode().then(
    () => image,
    () => null
  );
}

/** What `promise` gives, or null if it takes longer than `wait` milliseconds. */
function within<T>(promise: Promise<T | null>, wait: number): Promise<T | null> {
  return Promise.race([promise, new Promise<null>((resolve) => setTimeout(() => resolve(null), wait))]);
}
