// Whether a new version of Wren is ready to install, and whether updates
// install by themselves. Neither is real yet: both are made up here, until
// the app checks for updates.

import { useState } from "react";

export type Update = {
  /** The version ready to install, once there is one. */
  version: string | null;
  /** New versions install by themselves, as the app quits. */
  automatic: boolean;
  setAutomatic: (automatic: boolean) => void;
  /** Quits, installs the new version and opens it again. */
  install: () => void;
};

export function useUpdate(): Update {
  const [automatic, setAutomatic] = useState(false);
  return {
    version: "1.1.0",
    automatic,
    setAutomatic,
    install: () => console.info("Restart and Update: not real yet")
  };
}
