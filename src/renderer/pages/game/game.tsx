// Twig & Trill, wren://game: a wren's day, weaving a nest before the storm.
// This is the page: the canvas and its loop, the keys and pointer, and the
// cards over it. The game itself is in step.ts, and its drawing in draw.ts.
import { AnimatePresence, MotionConfig } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { draw } from "./draw";
import { Banner, EndCard, Hud, PausedCard, TitleCard } from "./screens";
import { Sound } from "./sound";
import { newWorld, resize, type Stats, type World } from "./state";
import { hud as readHud, type Hud as HudValues, idle, type Input, play, start as startGame, WIN_TIME } from "./step";

type Phase = "title" | "playing" | "paused" | "over" | "won";

// A new key: scores from the old game were counted another way.
const BEST_KEY = "twig-and-trill.high-score";

function loadBest() {
  try {
    return Number(localStorage.getItem(BEST_KEY)) || 0;
  } catch {
    return 0;
  }
}

function saveBest(best: number) {
  try {
    localStorage.setItem(BEST_KEY, String(best));
  } catch {}
}

const calm = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

// The keys that fly, as the direction each pushes.
const DIRECTIONS: Record<string, [number, number]> = {
  arrowleft: [-1, 0],
  a: [-1, 0],
  arrowright: [1, 0],
  d: [1, 0],
  arrowup: [0, -1],
  w: [0, -1],
  arrowdown: [0, 1],
  s: [0, 1]
};

export function Game() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const world = useRef<World>(newWorld(1280, 720, calm()));
  const scale = useRef(1);
  const input = useRef<Input>({ x: 0, y: 0, pointer: null, sing: false });
  const held = useRef(new Set<string>());
  const sound = useRef(new Sound());
  const phaseRef = useRef<Phase>("title");
  const [phase, setPhaseState] = useState<Phase>("title");
  const [hud, setHud] = useState<HudValues>(() => readHud(world.current));
  const [banner, setBanner] = useState<World["banner"]>(null);
  const [result, setResult] = useState<{ score: number; eggs: number; stats: Stats; best: boolean } | null>(null);
  const [best, setBest] = useState(loadBest);
  const [muted, setMuted] = useState(false);

  const setPhase = useCallback((next: Phase) => {
    phaseRef.current = next;
    setPhaseState(next);
  }, []);

  const start = useCallback(() => {
    const { width, height } = world.current;
    world.current = newWorld(width, height, calm());
    startGame(world.current);
    input.current = { x: 0, y: 0, pointer: null, sing: false };
    held.current.clear();
    setResult(null);
    sound.current.wake();
    setPhase("playing");
  }, [setPhase]);

  const finish = useCallback(
    (outcome: "over" | "won") => {
      const { score, eggs, stats } = world.current;
      const record = score > loadBest();
      if (record) {
        saveBest(score);
        setBest(score);
      }
      setResult({ score, eggs, stats: { ...stats }, best: record });
      setPhase(outcome);
    },
    [setPhase]
  );

  const togglePause = useCallback(() => {
    if (phaseRef.current === "playing") setPhase("paused");
    else if (phaseRef.current === "paused") setPhase("playing");
  }, [setPhase]);

  const toggleMute = useCallback(() => {
    setMuted((muted) => {
      sound.current.setMuted(!muted);
      return !muted;
    });
  }, []);

  // The loop: the garden always lives; the game moves only while it is on.
  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const fit = () => {
      const { width, height } = canvas.getBoundingClientRect();
      canvas.width = Math.round(width * devicePixelRatio);
      canvas.height = Math.round(height * devicePixelRatio);
      scale.current = resize(world.current, width, height);
    };
    const observer = new ResizeObserver(fit);
    observer.observe(canvas);
    fit();

    let last = performance.now();
    let shown = "";
    let bannerId = -1;
    let frame = requestAnimationFrame(function step(now) {
      const dt = Math.min(1 / 30, (now - last) / 1000);
      last = now;
      const current = world.current;
      const phase = phaseRef.current;

      if (phase === "title") idle(current, dt, sound.current);
      else if (phase !== "paused") {
        play(current, dt, input.current, sound.current);
        if (phase === "playing" && current.outcome && current.ending <= 0) finish(current.outcome);
      }
      sound.current.setWind(phase === "paused" ? 0 : current.wind);
      sound.current.music(phase === "playing", current.stage);

      const pixels = scale.current * devicePixelRatio;
      ctx.setTransform(pixels, 0, 0, pixels, 0, 0);
      draw(ctx, current, current.outcome === "won" ? 1 - current.ending / WIN_TIME : 0);

      if (phase === "playing") {
        const values = readHud(current);
        const key = JSON.stringify(values);
        if (key !== shown) {
          shown = key;
          setHud(values);
        }
        const id = current.banner?.id ?? -1;
        if (id !== bannerId) {
          bannerId = id;
          setBanner(current.banner ? { ...current.banner } : null);
        }
      }
      frame = requestAnimationFrame(step);
    });

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [finish]);

  useEffect(() => {
    const steer = () => {
      let x = 0;
      let y = 0;
      for (const key of held.current) {
        x += DIRECTIONS[key][0];
        y += DIRECTIONS[key][1];
      }
      input.current.x = Math.sign(x);
      input.current.y = Math.sign(y);
    };
    const keyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const phase = phaseRef.current;
      if (key in DIRECTIONS) {
        held.current.add(key);
        steer();
        event.preventDefault();
        return;
      }
      if (event.repeat) return;
      if ((key === " " || key === "enter") && (phase === "title" || phase === "over" || phase === "won")) start();
      else if ((key === " " || key === "shift" || key === "e") && phase === "playing") input.current.sing = true;
      else if (key === "p" || key === "escape") togglePause();
      else if (key === "m") toggleMute();
      else return;
      event.preventDefault();
    };
    const keyUp = (event: KeyboardEvent) => {
      held.current.delete(event.key.toLowerCase());
      steer();
    };
    const blur = () => {
      held.current.clear();
      steer();
      if (phaseRef.current === "playing") setPhase("paused");
    };
    addEventListener("keydown", keyDown);
    addEventListener("keyup", keyUp);
    addEventListener("blur", blur);
    return () => {
      removeEventListener("keydown", keyDown);
      removeEventListener("keyup", keyUp);
      removeEventListener("blur", blur);
      sound.current.music(false);
    };
  }, [start, togglePause, toggleMute, setPhase]);

  const point = (event: React.PointerEvent) => {
    const rect = event.currentTarget.getBoundingClientRect();
    input.current.pointer = {
      x: (event.clientX - rect.left) / scale.current,
      y: (event.clientY - rect.top) / scale.current
    };
  };

  return (
    <MotionConfig reducedMotion="user">
      <div
        className="relative h-full touch-none overflow-hidden bg-[#86acd9] font-[ui-rounded,system-ui,sans-serif] select-none"
        onPointerMove={point}
        onPointerDown={(event) => {
          point(event);
          if (phaseRef.current === "playing") input.current.sing = true;
        }}
        onPointerLeave={() => (input.current.pointer = null)}
      >
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

        {phase !== "title" && <Hud hud={hud} best={best} muted={muted} onMute={toggleMute} onPause={togglePause} />}
        {phase === "playing" && <Banner banner={banner} />}

        <AnimatePresence>
          {phase === "title" && <TitleCard key="title" best={best} onStart={start} />}
          {phase === "paused" && <PausedCard key="paused" onResume={togglePause} />}
          {(phase === "over" || phase === "won") && result && (
            <EndCard key="end" won={phase === "won"} {...result} onStart={start} />
          )}
        </AnimatePresence>
      </div>
    </MotionConfig>
  );
}
