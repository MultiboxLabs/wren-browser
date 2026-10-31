// A download as it starts: a badge comes out from under the pointer, where
// it was clicked for most likely, and arcs over the window to the Library
// button, where the downloads are. It pops up, a little past its size;
// flies, leaning into its way across, its shadow growing as it rises;
// shrinks towards the button's size as it falls; and is taken in by the
// button at speed, a ripple spreading from it. The badge is the same for
// every download, dark with an arrow down: a file's own icon may be as white
// as the page under it. The app says which window it started in, and where
// the pointer was (ipc/downloads.ts); with Reduced Motion, it does not fly.

import { animate, easeInOut, easeOut, motion, useMotionValue, useTransform } from "motion/react";
import { ArrowDown } from "lucide-react";
import { type RefObject, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { downloads, hasApp } from "@/ipc";
import { prefersReducedMotion } from "@/utils/motion";

// The pop: how long, in seconds, and its curve, which goes a little past
// its size and back.
const POP = { duration: 0.22, ease: [0.175, 0.885, 0.32, 1.275] } as const;
// The flight, which starts as the pop settles: how long, by how far it goes,
// in seconds, and its curve, off from rest and into the button still at
// speed.
const FLY_AFTER = 0.12;
const flyFor = (distance: number) => Math.min(Math.max(0.4 + distance / 2000, 0.5), 0.75);
const FLY_EASE = [0.45, 0, 0.7, 0.75] as const;
// The button taking it in: quick, and quicker as it goes; and the ripple,
// which starts with it, and slows as it spreads.
const TAKEN_IN = { duration: 0.16, ease: [0.3, 0, 1, 1] } as const;
const RIPPLE = { duration: 0.45, ease: easeOut, at: "<" } as const;
// How far it leans, in degrees, while it goes straight across.
const LEAN = 12;
// How high above the higher of its ends the arc's top is, and how near the
// window's top it may come, in points.
const RISE = 280;
const TOP = 24;
// How near the window's left edge it lands while the sidebar is hidden past
// it, in points.
const EDGE = 12;

type Point = [x: number, y: number];

type Flight = {
  /** The flight's own, for React. */
  key: number;
  from: Point;
  to: Point;
};

/** The flights of the downloads that start, to `target`, the Library button. */
export function DownloadFlights({ target }: { target: RefObject<HTMLElement | null> }) {
  const [flights, setFlights] = useState<Flight[]>([]);
  const next = useRef(0);

  useEffect(() => {
    if (!hasApp) return;
    return downloads.onStarted((started) => {
      const to = landing(target.current);
      if (!to || prefersReducedMotion()) return;
      const from: Point = started.at ?? [window.innerWidth / 2, window.innerHeight / 2];
      setFlights((flights) => [...flights, { key: next.current++, from, to }]);
    });
  }, [target]);

  if (flights.length === 0) return null;
  // Over all of the window, out of the sidebar, which is moved as it slides.
  return createPortal(
    flights.map((flight) => (
      <FlyingBadge
        key={flight.key}
        flight={flight}
        onDone={() => setFlights((flights) => flights.filter(({ key }) => key !== flight.key))}
      />
    )),
    document.body
  );
}

// Where a flight lands: the middle of the button, or the window's edge level
// with it while the sidebar is hidden past it. None while the sidebar is not
// laid out (the window is full screen).
function landing(button: HTMLElement | null): Point | undefined {
  const box = button?.getBoundingClientRect();
  if (!box || box.width === 0) return undefined;
  return [Math.max(box.left + box.width / 2, EDGE), box.top + box.height / 2];
}

// A quadratic Bézier curve's coordinate at `t`, from `a` to `c` by way of
// `b`, and how fast it changes there.
const bezier = (a: number, b: number, c: number, t: number) => (1 - t) ** 2 * a + 2 * (1 - t) * t * b + t ** 2 * c;
const bezierSpeed = (a: number, b: number, c: number, t: number) => 2 * (1 - t) * (b - a) + 2 * t * (c - b);

function FlyingBadge({ flight, onDone }: { flight: Flight; onDone: () => void }) {
  const {
    from: [fromX, fromY],
    to: [toX, toY]
  } = flight;
  // Each beat's progress, 0 to 1: the pop, the flight, the taking in, and
  // the ripple.
  const popped = useMotionValue(0);
  const progress = useMotionValue(0);
  const taken = useMotionValue(0);
  const rippled = useMotionValue(0);
  useEffect(() => {
    const flyingFor = flyFor(Math.hypot(toX - fromX, toY - fromY));
    const beats = animate([
      [popped, 1, POP],
      [progress, 1, { duration: flyingFor, ease: FLY_EASE, at: FLY_AFTER }],
      [taken, 1, TAKEN_IN],
      [rippled, 1, RIPPLE]
    ]);
    beats.then(onDone);
    return () => beats.stop();
  }, []);

  // The curve's middle point: halfway across, so it goes across evenly, as
  // a thrown thing does; and as high as puts the arc's top at `top`, which
  // a quadratic curve reaches only part of the way to.
  const viaX = (fromX + toX) / 2;
  const higher = Math.min(fromY, toY);
  const top = Math.min(Math.max(higher - RISE, TOP), higher);
  const viaY = top - Math.sqrt((fromY - top) * (toY - top));
  const x = useTransform(progress, (t) => bezier(fromX, viaX, toX, t));
  const y = useTransform(progress, (t) => bezier(fromY, viaY, toY, t));
  // It pops up from half its size, shrinks towards the button's over the
  // second half of the flight, and to nothing as it is taken in; it fades in
  // with the pop and out as it is taken in.
  const scale = useTransform(() => {
    const flying = progress.get() < 0.5 ? 1 : 1 - 0.3 * easeInOut((progress.get() - 0.5) / 0.5);
    return (0.5 + 0.5 * popped.get()) * flying * (1 - 0.6 * taken.get());
  });
  const opacity = useTransform(() => Math.min(popped.get() * 2, 1) * (1 - taken.get()));
  // It leans as far as it goes across rather than up or down.
  const rotate = useTransform(progress, (t) => {
    const across = bezierSpeed(fromX, viaX, toX, t);
    const up = bezierSpeed(fromY, viaY, toY, t);
    return (LEAN * across) / (Math.hypot(across, up) || 1);
  });
  // How high it is, 0 at the higher of its ends to 1 at the arc's top.
  const height = useTransform(y, (y) => (higher > top ? Math.min(Math.max((higher - y) / (higher - top), 0), 1) : 0));
  const filter = useTransform(
    height,
    (h) => `drop-shadow(0 ${4 + 10 * h}px ${8 + 10 * h}px rgb(0 0 0 / ${0.3 - 0.12 * h}))`
  );
  const rippleScale = useTransform(rippled, [0, 1], [0.6, 1.6]);
  // Unseen until the badge is taken in.
  const rippleOpacity = useTransform(rippled, [0, 0.01, 1], [0, 0.5, 0]);

  return (
    <>
      <motion.div
        aria-hidden
        style={{ x, y, scale, opacity, rotate, filter }}
        className="download-flight pointer-events-none fixed top-0 left-0 -mt-5.5 -ml-5.5 grid size-11 place-items-center rounded-full text-white"
      >
        <ArrowDown size={22} strokeWidth={2.5} />
      </motion.div>
      <motion.div
        aria-hidden
        style={{ x: toX, y: toY, scale: rippleScale, opacity: rippleOpacity }}
        className="pointer-events-none fixed top-0 left-0 -mt-4 -ml-4 size-8 rounded-full border-2 border-fg"
      />
    </>
  );
}
