// A source's app icon, as the app gives it (`iconUrl`); or, where there is
// none to be had, a plain tile with the first letter of its name.

import { useState } from "react";
import { iconUrl } from "@/ipc";

export function SourceIcon({ source, size }: { source: { name: string; icon: string }; size: number }) {
  const [failed, setFailed] = useState(false);
  if (!source.icon || failed) {
    // As large as an app's art is inside its box.
    const tile = Math.round(size * 0.82);
    return (
      <span className="grid shrink-0 place-items-center" style={{ width: size, height: size }}>
        <span
          className="grid place-items-center rounded-[22%] bg-white font-medium text-[#55565e] shadow-[0_1px_2px_rgb(0_0_0/0.18),0_0_0_0.5px_rgb(0_0_0/0.08)]"
          style={{ width: tile, height: tile, fontSize: tile * 0.42 }}
        >
          {source.name[0]}
        </span>
      </span>
    );
  }
  return (
    <img
      src={iconUrl(source.icon)}
      alt=""
      className="shrink-0"
      style={{ width: size, height: size }}
      onError={() => setFailed(true)}
    />
  );
}
