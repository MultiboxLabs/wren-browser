// A source's app icon, as the app gives it (`iconUrl`); or, where there is
// none to be had, the first letter of its name on a soft white tile.
//
// An app icon's body sits inside a margin of its image (on macOS, 824 of
// 1024 points). `body` draws the image larger by that margin, so the body
// itself is `size`, as a tile beside it is (the sky's Wren); otherwise the
// image is `size`, as icons in a list are.

import { useState } from "react";
import { iconUrl } from "@/ipc";

const BODY = 824 / 1024;

export function SourceIcon({
  source,
  size,
  body
}: {
  source: { name: string; icon: string };
  size: number;
  body?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  if (source.icon && !failed) {
    const image = body ? size / BODY : size;
    return (
      <span className="relative shrink-0" style={{ width: size, height: size }}>
        <img
          src={iconUrl(source.icon)}
          alt=""
          className="absolute max-w-none"
          style={{ width: image, height: image, left: (size - image) / 2, top: (size - image) / 2 }}
          onError={() => setFailed(true)}
        />
      </span>
    );
  }
  return (
    <span
      className="grid shrink-0 place-items-center rounded-[24%] bg-linear-to-b from-[#f5f5f7] to-[#e2e3e8] text-[#55565e] shadow-[0_0_0_0.5px_rgb(30_32_90/0.18),0_1px_2px_rgb(30_32_90/0.12)]"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {source.name[0]}
    </span>
  );
}
