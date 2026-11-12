// Starts the run the app says this is, if it is one: the sidebar's
// performance run (run.tsx), or the one that checks its drags (drags.tsx).
// A run's code loads only then.

import { lazy, Suspense, useEffect, useState } from "react";
import { hasApp, perf, type RunConfig } from "@/ipc";

const PerfRun = lazy(() => import("./run").then((run) => ({ default: run.PerfRun })));
const DragsRun = lazy(() => import("./drags").then((run) => ({ default: run.DragsRun })));

/** Inside the BrowserProvider, whose state the run watches. */
export function Perf() {
  const [config, setConfig] = useState<RunConfig | null>(null);
  useEffect(() => {
    if (hasApp) perf.config().then(setConfig, () => {});
  }, []);
  return (
    config && <Suspense>{config.run === "drags" ? <DragsRun config={config} /> : <PerfRun config={config} />}</Suspense>
  );
}
