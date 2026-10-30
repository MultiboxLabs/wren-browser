// What sits over the garden: the numbers while playing, the banner as each
// part of the day begins, and the cards before, between and after games.
import { AnimatePresence, motion } from "motion/react";
import { type ReactNode, useEffect, useRef } from "react";
import { cn } from "../../utils/cn";
import { disc } from "./scene";
import { drawHailstone, drawMaterial } from "./sprites";
import type { Stats } from "./state";
import type { Hud as HudValues } from "./step";
import { STAGES } from "./tune";

const ease = [0.22, 1, 0.36, 1] as const;

export function Hud({
  hud,
  best,
  muted,
  onMute,
  onPause
}: {
  hud: HudValues;
  best: number;
  muted: boolean;
  onMute: () => void;
  onPause: () => void;
}) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-4 p-4">
      <div className="flex items-center gap-2">
        <Pill className="min-w-28 flex-col items-start gap-0 py-2">
          <span className="text-[11px] font-semibold tracking-wide text-stone-500 uppercase">Score</span>
          <span className="text-2xl leading-none font-black tabular-nums">{hud.score}</span>
        </Pill>
        {hud.multiplier > 1 && (
          <Pill className="flex-col gap-1 py-2 text-lg leading-none font-black text-amber-700">
            ×{hud.multiplier}
            {/* The streak's time left. */}
            <span className="h-1 w-8 overflow-hidden rounded-full bg-amber-100">
              <span className="block h-full rounded-full bg-amber-500" style={{ width: `${hud.streak * 100}%` }} />
            </span>
          </Pill>
        )}
        <Pill className="gap-1">
          {Array.from({ length: hud.maxHearts }, (_, i) => (
            <Heart key={i} full={i < hud.hearts} />
          ))}
        </Pill>
      </div>

      <Pill className="flex-col gap-1.5 px-4 py-2">
        <div className="flex items-center gap-1.5">
          {STAGES.map((stage, i) => (
            <Egg key={stage.name} fill={i < hud.eggs ? 1 : i === hud.eggs ? hud.woven / hud.needed : 0} />
          ))}
        </div>
        <span className="text-[11px] font-semibold tracking-wide text-stone-500 uppercase">
          {hud.stage} · {Math.min(hud.woven, hud.needed)}/{hud.needed} woven
        </span>
      </Pill>

      <div className="flex items-center gap-2">
        <Pill className="gap-1 text-sm">
          <span className="text-stone-500">Carrying</span>
          {Array.from({ length: 3 }, (_, i) => (
            <span key={i} className={cn("size-2.5 rounded-full", i < hud.carry ? "bg-amber-700" : "bg-stone-300")} />
          ))}
        </Pill>
        <Song value={hud.song} />
        <Pill className="text-sm text-stone-500">Best {best}</Pill>
        <RoundButton label={muted ? "Unmute (M)" : "Mute (M)"} onClick={onMute}>
          {muted ? <SpeakerOff /> : <SpeakerOn />}
        </RoundButton>
        <RoundButton label="Pause (P)" onClick={onPause}>
          <svg viewBox="0 0 16 16" className="size-4" fill="currentColor">
            <rect x="3.5" y="3" width="3" height="10" rx="1" />
            <rect x="9.5" y="3" width="3" height="10" rx="1" />
          </svg>
        </RoundButton>
      </div>
    </div>
  );
}

// The song meter: a ring that fills, and glows once the wren can sing.
function Song({ value }: { value: number }) {
  const ready = value >= 1;
  return (
    <div
      className={cn(
        "relative grid size-12 place-items-center rounded-full shadow-sm transition-shadow",
        ready && "shadow-[0_0_0_4px_rgb(253_224_71_/_0.5),0_0_24px_rgb(253_224_71_/_0.8)]"
      )}
      style={{
        background: `conic-gradient(${ready ? "#f59e0b" : "#d6a35c"} ${value * 360}deg, rgb(255 255 255 / 0.8) 0)`
      }}
      title="Song: sing with Space or a click once it is full"
    >
      <div className="grid size-9 place-items-center rounded-full bg-[#fffaf2] text-lg text-amber-800">♪</div>
      {ready && (
        <span className="absolute -bottom-5 rounded-full bg-amber-500 px-1.5 text-[10px] font-bold whitespace-nowrap text-white">
          Space
        </span>
      )}
    </div>
  );
}

export function Banner({ banner }: { banner: { id: number; title: string; subtitle: string } | null }) {
  return (
    <AnimatePresence>
      {banner && (
        <motion.div
          key={banner.id}
          className="pointer-events-none absolute inset-x-0 top-[26%] text-center text-white"
          initial={{ opacity: 0, y: 12, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.5, ease }}
        >
          <h2 className="text-6xl font-black tracking-tight [text-shadow:0_3px_18px_rgb(40_20_0_/_0.45)]">
            {banner.title}
          </h2>
          <p className="mt-2 text-lg font-semibold [text-shadow:0_2px_10px_rgb(40_20_0_/_0.6)]">{banner.subtitle}</p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function TitleCard({ best, onStart }: { best: number; onStart: () => void }) {
  return (
    <Card>
      <p className="text-sm font-bold tracking-[0.2em] text-amber-700 uppercase">A wren's day</p>
      <h1 className="mt-1 text-6xl font-black tracking-tight text-[#5a3a1e]">Twig &amp; Trill</h1>
      <p className="mt-3 text-lg text-stone-600">
        Weave a nest and lay five eggs before the night's storm. The weather turns as the day goes on.
      </p>
      <ul className="mt-6 grid grid-cols-2 gap-2.5 text-left text-sm leading-snug text-stone-700">
        <HowTo
          draw={(ctx) => {
            ctx.translate(-4, 2);
            drawMaterial(ctx, "twig");
            ctx.translate(10, 10);
            ctx.scale(0.6, 0.6);
            drawMaterial(ctx, "feather");
          }}
        >
          Gather twigs, moss and feathers. Ribbons are rare and worth the most.
        </HowTo>
        <HowTo
          draw={(ctx) => {
            ctx.fillStyle = "#5b3d22";
            ctx.beginPath();
            ctx.ellipse(0, 2, 17, 8, 0, 0, Math.PI);
            ctx.fill();
            ctx.fillStyle = "#e4f1f8";
            ctx.beginPath();
            ctx.ellipse(0, -3, 5, 7, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = "#8a5a32";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.ellipse(0, 3, 16, 5, 0, 0, Math.PI);
            ctx.stroke();
          }}
        >
          Carry up to three home at once. Full loads and quick trips multiply your points.
        </HowTo>
        <HowTo
          draw={(ctx) => {
            drawHailstone(ctx, -6, -4, 7);
            drawHailstone(ctx, 7, 5, 5.5);
          }}
        >
          Dark clouds bring hail. Dodge it, or shelter under the trees.
        </HowTo>
        <HowTo
          draw={(ctx) => {
            disc(ctx, 0, 0, 15, "#f6c453");
            ctx.font = "700 20px ui-rounded, system-ui, sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillStyle = "#7a4a12";
            ctx.fillText("♪", 0, 1);
          }}
        >
          Butterflies and deliveries fill your song. Sing to break hail and scare off the magpie.
        </HowTo>
      </ul>
      <p className="mt-5 text-xs text-stone-500">
        Arrow keys or the mouse to fly · Space or click to sing · P to pause · M to mute
      </p>
      <StartButton onClick={onStart}>Take flight</StartButton>
      {best > 0 && <p className="mt-3 text-xs font-semibold text-stone-500">Best {best}</p>}
    </Card>
  );
}

export function PausedCard({ onResume }: { onResume: () => void }) {
  return (
    <Card>
      <h2 className="text-4xl font-black text-[#5a3a1e]">Perched</h2>
      <p className="mt-2 text-stone-600">The garden waits for you.</p>
      <StartButton onClick={onResume} hint="P">
        Fly on
      </StartButton>
    </Card>
  );
}

export function EndCard({
  won,
  score,
  eggs,
  stats,
  best,
  onStart
}: {
  won: boolean;
  score: number;
  eggs: number;
  stats: Stats;
  best: boolean;
  onStart: () => void;
}) {
  const minutes = Math.floor(stats.time / 60);
  const seconds = Math.floor(stats.time % 60);
  return (
    <Card>
      <p className="text-sm font-bold tracking-[0.2em] text-amber-700 uppercase">{won ? "Dawn" : "Nightfall"}</p>
      <h2 className="mt-1 text-5xl font-black tracking-tight text-[#5a3a1e]">
        {won ? "A full clutch" : "The storm won this time"}
      </h2>
      <p className="mt-3 text-stone-600">
        {won
          ? "Five eggs, safe and warm, and the chicks are out to meet the morning."
          : `${eggs} ${eggs === 1 ? "egg" : "eggs"} in the nest. Shelter from the hail, and try again.`}
      </p>
      <div className="mt-6 text-6xl font-black tabular-nums text-[#5a3a1e]">{score}</div>
      {best && (
        <p className="mt-2 inline-block rounded-full bg-amber-100 px-3 py-1 text-sm font-bold text-amber-800">
          New best
        </p>
      )}
      <dl className="mt-6 grid grid-cols-4 gap-2 text-sm">
        <Stat label="Trips home" value={stats.deliveries} />
        <Stat label="Best streak" value={stats.bestStreak} />
        <Stat label="Caught mid-air" value={stats.caughtMidAir} />
        <Stat label="Time" value={`${minutes}:${String(seconds).padStart(2, "0")}`} />
      </dl>
      <StartButton onClick={onStart}>Fly again</StartButton>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-2xl bg-amber-50 px-2 py-3">
      <dd className="text-xl font-black text-[#5a3a1e] tabular-nums">{value}</dd>
      <dt className="text-xs text-stone-500">{label}</dt>
    </div>
  );
}

function Card({ children }: { children: ReactNode }) {
  return (
    <motion.div
      className="absolute inset-0 grid place-items-center bg-[rgb(40_24_8_/_0.18)] p-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3, ease }}
    >
      <motion.div
        className="w-full max-w-xl rounded-[28px] bg-[#fffaf2] p-8 text-center shadow-2xl ring-1 ring-black/5"
        initial={{ y: 16, scale: 0.98 }}
        animate={{ y: 0, scale: 1 }}
        transition={{ duration: 0.45, ease }}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}

function HowTo({ draw, children }: { draw: (ctx: CanvasRenderingContext2D) => void; children: ReactNode }) {
  return (
    <li className="flex items-center gap-3 rounded-2xl bg-amber-50/80 p-3">
      <Icon draw={draw} />
      <span>{children}</span>
    </li>
  );
}

// A small picture drawn with the game's own drawing, centred on 0, 0.
function Icon({ draw, size = 44 }: { draw: (ctx: CanvasRenderingContext2D) => void; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext("2d")!;
    canvas.width = size * devicePixelRatio;
    canvas.height = size * devicePixelRatio;
    ctx.setTransform(
      devicePixelRatio,
      0,
      0,
      devicePixelRatio,
      (size / 2) * devicePixelRatio,
      (size / 2) * devicePixelRatio
    );
    draw(ctx);
  }, [draw, size]);
  return <canvas ref={ref} className="shrink-0" style={{ width: size, height: size }} />;
}

function StartButton({
  onClick,
  children,
  hint = "Space"
}: {
  onClick: () => void;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <button
      onClick={onClick}
      className="mt-6 rounded-full bg-[#8a5a32] px-8 py-3 text-lg font-bold text-white shadow-md transition hover:bg-[#9b6a3e] active:scale-95 motion-reduce:active:scale-100"
    >
      {children} <span className="ml-1 text-sm font-semibold opacity-60">{hint}</span>
    </button>
  );
}

function Pill({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "flex items-center gap-1.5 rounded-2xl bg-white/85 px-3 py-1.5 font-semibold text-stone-800 shadow-sm backdrop-blur",
        className
      )}
    >
      {children}
    </div>
  );
}

function RoundButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      aria-label={label}
      title={label}
      onClick={onClick}
      onPointerDown={(event) => event.stopPropagation()}
      className="pointer-events-auto grid size-9 place-items-center rounded-full bg-white/85 text-stone-700 shadow-sm backdrop-blur transition hover:bg-white"
    >
      {children}
    </button>
  );
}

function Heart({ full }: { full: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className={cn("size-5 transition", full ? "text-rose-500" : "text-stone-300")}>
      <path
        fill="currentColor"
        d="M12 21s-7.5-4.6-9.6-9.2C1 8.6 3 5 6.6 5c2.1 0 3.5 1.2 4.4 2.6C11.9 6.2 13.3 5 15.4 5 19 5 21 8.6 19.6 11.8 17.5 16.4 12 21 12 21z"
      />
    </svg>
  );
}

// An egg in the HUD: filled once laid, filling while it is being earned.
function Egg({ fill }: { fill: number }) {
  const level = Math.min(1, fill) * 100;
  return (
    <span
      className={cn("relative h-6 w-[18px] ring-1 ring-[#c9bfb2]", fill >= 1 && "ring-[#8fb9cf]")}
      style={{
        borderRadius: "50% 50% 50% 50% / 60% 60% 40% 40%",
        background: `linear-gradient(to top, #bfe0f2 ${level}%, #ece7df ${level}%)`
      }}
    >
      {fill >= 1 && (
        <>
          <span className="absolute top-[8px] left-[5px] size-[3px] rounded-full bg-[#b9805a]" />
          <span className="absolute top-[13px] left-[10px] size-[2.5px] rounded-full bg-[#b9805a]" />
        </>
      )}
    </span>
  );
}

function SpeakerOn() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    >
      <path d="M2.5 6h2.5l3-2.5v9L5 10H2.5z" fill="currentColor" />
      <path d="M10.5 5.5a3.5 3.5 0 0 1 0 5M12.5 3.5a6.5 6.5 0 0 1 0 9" />
    </svg>
  );
}

function SpeakerOff() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    >
      <path d="M2.5 6h2.5l3-2.5v9L5 10H2.5z" fill="currentColor" />
      <path d="M10.5 6l4 4M14.5 6l-4 4" />
    </svg>
  );
}
