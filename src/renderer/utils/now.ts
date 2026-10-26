// Now, for what is said relative to it ("2 hours ago").

import { useEffect, useState } from "react";

/** Now, again each `every` milliseconds. */
export function useNow(every = 30_000) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), every);
    return () => clearInterval(timer);
  }, [every]);
  return now;
}
