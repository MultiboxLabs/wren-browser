// Starts the sidebar's performance run (run.tsx) when the app says this is
// one. Its code loads only then.

import { lazy, Suspense, useEffect, useState } from "react";
import { hasApp, perf, type PerfConfig } from "../ipc";

const PerfRun = lazy(() => import("./run").then((run) => ({ default: run.PerfRun })));

/** Inside the BrowserProvider, whose state the run watches. */
export function Perf() {
  const [config, setConfig] = useState<PerfConfig | null>(null);
  useEffect(() => {
    if (hasApp) perf.config().then(setConfig, () => {});
  }, []);
  return (
    config && (
      <Suspense>
        <PerfRun config={config} />
      </Suspense>
    )
  );
}
