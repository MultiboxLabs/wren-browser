import { useCallback, useEffect, useRef, useState } from "react";
import { Sound } from "./sound";
import { ambient, draw, type Hud, type Input, MAX_HEARTS, newWorld, play, TWIGS_PER_EGG, type World } from "./world";
import { cn } from "../../utils/cn";

type Phase = "title" | "playing" | "paused" | "over";

const BEST_KEY = "twig-and-trill.best";

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

export function Game() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const world = useRef<World>(newWorld(innerWidth, innerHeight));
  const input = useRef<Input>({ left: false, right: false, pointerX: null });
  const sound = useRef(new Sound());
  const phaseRef = useRef<Phase>("title");
  const [phase, setPhaseState] = useState<Phase>("title");
  const [hud, setHud] = useState<Hud>(world.current.hud);
  const [best, setBest] = useState(loadBest);
  const [newBest, setNewBest] = useState(false);
  const [muted, setMuted] = useState(false);

  const setPhase = useCallback((next: Phase) => {
    phaseRef.current = next;
    setPhaseState(next);
  }, []);

  const start = useCallback(() => {
    const { width, height, clouds } = world.current;
    world.current = newWorld(width, height, clouds);
    setHud({ ...world.current.hud });
    setNewBest(false);
    sound.current.wake();
    setPhase("playing");
  }, [setPhase]);

  const end = useCallback(() => {
    const score = world.current.hud.score;
    sound.current.over();
    setPhase("over");
    setBest((best) => {
      if (score <= best) return best;
      saveBest(score);
      setNewBest(true);
      return score;
    });
  }, [setPhase]);

  const toggleMute = useCallback(() => {
    sound.current.muted = !sound.current.muted;
    setMuted(sound.current.muted);
  }, []);

  // The loop: the world always drifts; a game runs only while playing.
  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const resize = () => {
      const { width, height } = canvas.getBoundingClientRect();
      canvas.width = Math.round(width * devicePixelRatio);
      canvas.height = Math.round(height * devicePixelRatio);
      ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
      world.current.width = width;
      world.current.height = height;
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    let last = performance.now();
    let shown = "";
    let frame = requestAnimationFrame(function step(now) {
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      const current = world.current;
      if (phaseRef.current !== "paused") ambient(current, dt);
      if (phaseRef.current === "playing") {
        const over = play(current, dt, input.current, sound.current);
        const key = JSON.stringify(current.hud);
        if (key !== shown) {
          shown = key;
          setHud({ ...current.hud });
        }
        if (over) end();
      }
      draw(ctx, current, phaseRef.current === "playing");
      frame = requestAnimationFrame(step);
    });

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [end]);

  useEffect(() => {
    const keys = (down: boolean) => (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (key === "arrowleft" || key === "a") input.current.left = down;
      else if (key === "arrowright" || key === "d") input.current.right = down;
      if (!down) return;
      const phase = phaseRef.current;
      if ((key === " " || key === "enter") && (phase === "title" || phase === "over")) start();
      else if ((key === "p" || key === "escape") && (phase === "playing" || phase === "paused"))
        setPhase(phase === "playing" ? "paused" : "playing");
      else if (key === "m") toggleMute();
    };
    const keyDown = keys(true);
    const keyUp = keys(false);
    const blur = () => {
      input.current.left = input.current.right = false;
      if (phaseRef.current === "playing") setPhase("paused");
    };
    addEventListener("keydown", keyDown);
    addEventListener("keyup", keyUp);
    addEventListener("blur", blur);
    return () => {
      removeEventListener("keydown", keyDown);
      removeEventListener("keyup", keyUp);
      removeEventListener("blur", blur);
    };
  }, [start, setPhase, toggleMute]);

  return (
    <div
      className="relative h-full touch-none overflow-hidden font-[ui-rounded,system-ui,sans-serif] select-none"
      onPointerMove={(event) => {
        input.current.pointerX = event.clientX - event.currentTarget.getBoundingClientRect().left;
      }}
    >
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {phase !== "title" && (
        <div className="absolute inset-x-0 top-0 flex items-center gap-3 p-4 text-sm font-semibold">
          <Pill>
            <span className="tabular-nums">{hud.score}</span>
            <span className="text-stone-500">pts</span>
          </Pill>
          <Pill>
            {Array.from({ length: MAX_HEARTS }, (_, i) => (
              <span key={i} className={cn(i >= hud.hearts && "opacity-25 grayscale")}>
                ❤️
              </span>
            ))}
          </Pill>
          <Pill>
            <span>🥚 {hud.eggs}</span>
            <span className="h-2 w-20 overflow-hidden rounded-full bg-stone-300">
              <span
                className="block h-full rounded-full bg-amber-600 transition-all motion-reduce:transition-none"
                style={{ width: `${((hud.twigs % TWIGS_PER_EGG) / TWIGS_PER_EGG) * 100}%` }}
              />
            </span>
          </Pill>
          <div className="flex-1" />
          <Pill>Best {best}</Pill>
          <button onClick={toggleMute} className="rounded-full bg-white/80 px-3 py-1.5 shadow-sm backdrop-blur">
            {muted ? "🔇" : "🔊"}
          </button>
        </div>
      )}

      {phase === "title" && (
        <Card>
          <div className="text-6xl">🪺</div>
          <h1 className="mt-2 text-5xl font-black tracking-tight text-amber-900">Twig &amp; Trill</h1>
          <p className="mt-2 text-stone-600">Help a little wren build a nest before the weather turns.</p>
          <ul className="mt-6 grid grid-cols-3 gap-3 text-sm">
            <Legend icon="🌿" text="Catch twigs to weave the nest" />
            <Legend icon="🍒" text="Berries mend a heart" />
            <Legend icon="🧊" text="Dodge the hail!" />
          </ul>
          <p className="mt-5 text-xs text-stone-500">
            Every {TWIGS_PER_EGG} twigs lays an egg, and the wind grows bolder. Mouse or ← → to fly · P to pause · M to
            mute
          </p>
          <StartButton onClick={start}>Take flight</StartButton>
          {best > 0 && <p className="mt-3 text-xs text-stone-500">Best: {best}</p>}
        </Card>
      )}

      {phase === "paused" && (
        <Card>
          <h2 className="text-3xl font-black text-amber-900">Perched</h2>
          <p className="mt-2 text-stone-600">Press P to keep flying.</p>
        </Card>
      )}

      {phase === "over" && (
        <Card>
          <div className="text-5xl">🌨️</div>
          <h2 className="mt-2 text-4xl font-black tracking-tight text-amber-900">The storm won this time</h2>
          <p className="mt-3 text-lg text-stone-700">
            <span className="font-bold tabular-nums">{hud.score}</span> points · {hud.eggs}{" "}
            {hud.eggs === 1 ? "egg" : "eggs"} · {hud.twigs} twigs
          </p>
          {newBest && (
            <p className="mt-2 inline-block rounded-full bg-amber-100 px-3 py-1 text-sm font-bold text-amber-800">
              New best!
            </p>
          )}
          <StartButton onClick={start}>Fly again</StartButton>
        </Card>
      )}
    </div>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 rounded-full bg-white/80 px-3 py-1.5 text-stone-800 shadow-sm backdrop-blur">
      {children}
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 grid place-items-center bg-black/10 p-6">
      <div className="max-w-lg rounded-3xl bg-white/90 p-8 text-center shadow-xl backdrop-blur">{children}</div>
    </div>
  );
}

function Legend({ icon, text }: { icon: string; text: string }) {
  return (
    <li className="rounded-2xl bg-amber-50 p-3 text-stone-700">
      <div className="text-2xl">{icon}</div>
      {text}
    </li>
  );
}

function StartButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="mt-6 rounded-full bg-amber-700 px-8 py-3 text-lg font-bold text-white shadow-md transition hover:bg-amber-600 active:scale-95 motion-reduce:active:scale-100"
    >
      {children} <span className="text-sm font-normal opacity-70">(Space)</span>
    </button>
  );
}
