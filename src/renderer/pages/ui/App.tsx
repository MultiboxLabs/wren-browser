// `wren` is there only when the app gave this page messages; not in a
// plain browser tab.
const canInvoke = typeof wren !== "undefined";

export function App() {
  return (
    <main className="grid h-full place-items-center bg-white text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <div className="text-center">
        <h1 className="text-5xl font-bold tracking-tight">Hello World!</h1>
        <p className="mt-3 text-neutral-500">From Wren, served at {location.origin}</p>
        <button
          disabled={!canInvoke}
          onClick={() => wren.invoke("game.open")}
          className="mt-8 rounded-full bg-amber-700 px-6 py-2.5 font-semibold text-white shadow-sm transition hover:bg-amber-600 active:scale-95 disabled:opacity-40"
        >
          Play Twig &amp; Trill
        </button>
      </div>
    </main>
  );
}
