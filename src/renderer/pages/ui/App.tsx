import { useEffect, useState } from "react";
import { counter, game, hasApp } from "../../ipc";

const button =
  "rounded-full px-6 py-2.5 font-semibold text-white shadow-sm transition active:scale-95 disabled:opacity-40";

export function App() {
  // The main process keeps the count; this is the last value it answered.
  const [count, setCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (hasApp) counter.get().then(setCount, (error: Error) => setError(error.message));
  }, []);

  const add = () => counter.add(1).then(setCount, (error: Error) => setError(error.message));

  return (
    <main className="grid h-full place-items-center bg-white text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <div className="text-center">
        <h1 className="text-5xl font-bold tracking-tight">Hello World!</h1>
        <p className="mt-3 text-neutral-500">From Wren, served at {location.origin}</p>

        <div className="mt-10 rounded-3xl border border-neutral-200 px-10 py-6 dark:border-neutral-800">
          <p className="text-sm text-neutral-500">The main process counts</p>
          <p className="mt-1 text-6xl font-bold tabular-nums">{count ?? "–"}</p>
          <button disabled={!hasApp} onClick={add} className={`${button} mt-4 bg-sky-600 hover:bg-sky-500`}>
            Add one
          </button>
          {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
        </div>

        <button disabled={!hasApp} onClick={game.open} className={`${button} mt-8 bg-amber-700 hover:bg-amber-600`}>
          Play Twig &amp; Trill
        </button>
      </div>
    </main>
  );
}
